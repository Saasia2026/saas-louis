import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { isTime } from "@/lib/posting-plan";
import { createClient } from "@/lib/supabase/server";

// Analyse d'un compte TikTok par Scout : 30 dernières vidéos récoltées par
// Apify (environ 0,12 $), chiffres calculés ici, bilan rédigé par Claude
// dans la langue de l'utilisateur.

export type TikTokVideo = {
  url: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  seconds: number;
  postedAt: string;
  caption: string;
};

export type TikTokStats = {
  handle: string;
  followers: number;
  videos: number;
  medianViews: number;
  engagement: number; // (j'aime + commentaires + partages) / vues, médiane
  postsPerWeek: number;
  top: TikTokVideo[];
};

export type TikTokReport = {
  summary: string;
  potential: { score: number; note: string };
  keep: string[];
  stop: string[];
  nextVideos: string[];
  rhythm: { weekdays: number[]; times: string[]; reason: string };
};

export type TikTokAnalysis = { id: string; handle: string; createdAt: string; stats: TikTokStats; report: TikTokReport };

// Dernière analyse réussie de l'utilisateur connecté (la règle d'accès ne
// laisse lire que les siennes).
export async function latestTikTokAnalysis(): Promise<TikTokAnalysis | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tiktok_analyses")
    .select("id, handle, created_at, stats, report")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.stats || !data.report) return null;
  return {
    id: data.id,
    handle: data.handle,
    createdAt: data.created_at,
    stats: data.stats as unknown as TikTokStats,
    report: data.report as unknown as TikTokReport,
  };
}

const MAX_VIDEOS = 30;
const MAX_CHARGE_USD = 0.5; // minimum accepté par Apify ; coût réel ≈ 0,12 $

// « @nom », « nom » ou un lien tiktok.com/@nom → « nom ».
export function normalizeHandle(input: string): string | null {
  const raw = input.trim();
  const fromUrl = /tiktok\.com\/@([A-Za-z0-9._]+)/i.exec(raw)?.[1];
  const handle = (fromUrl ?? raw.replace(/^@/, "")).trim();
  return /^[A-Za-z0-9._]{2,24}$/.test(handle) ? handle.toLowerCase() : null;
}

type Item = {
  id?: string;
  text?: string;
  webVideoUrl?: string;
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  isPinned?: boolean;
  authorMeta?: { name?: string; fans?: number };
  videoMeta?: { duration?: number };
};

async function fetchProfile(handle: string): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN manquant");
  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?maxTotalChargeUsd=${MAX_CHARGE_USD}&timeout=180`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: [handle],
        resultsPerPage: MAX_VIDEOS,
        profileScrapeSections: ["videos"],
        profileSorting: "latest",
        excludePinnedPosts: true,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      }),
      signal: AbortSignal.timeout(200_000),
    },
  );
  if (!res.ok) throw new Error(`Apify ${res.status}`);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as Item[]).filter((v) => v.id && v.webVideoUrl && typeof v.playCount === "number") : [];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const ReportSchema = z.object({
  summary: z.string(),
  potential: z.object({ score: z.number(), note: z.string() }),
  keep: z.array(z.string()),
  stop: z.array(z.string()),
  nextVideos: z.array(z.string()),
  rhythm: z.object({ weekdays: z.array(z.number()), times: z.array(z.string()), reason: z.string() }),
});

const LANGUAGE: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

const SYSTEM = `You are Scout, the growth advisor inside TwinPost, a web app where creators replace a person in a real clip with any character from a photo ("Replace"), rebuild a scene from a clip's movements ("Motion transfer"), create AI influencer characters, review a clip's virality and schedule posts. You review a creator's TikTok account from the numbers of their latest videos and tell them, like a sharp, honest coach, what to keep, what to stop and what to make next.

Ground every claim in the data you are given (views against the account's median, engagement, shares, posting days and hours, duration, captions). You cannot see the videos: never invent visual details. Compare videos with each other rather than with the whole of TikTok. Be concrete and short.

Write:
- summary: 2 or 3 sentences on where the account stands.
- potential: score from 0 to 100 for the account's viral potential in the coming weeks (be calibrated: most small accounts sit between 30 and 60), and one sentence explaining it.
- keep: 2 to 4 points that work, each naming the evidence (for example a video or a pattern and its numbers).
- stop: 1 to 3 points to stop or change, with the evidence.
- nextVideos: 3 concrete video ideas for this account, each one sentence, that a TwinPost user can make (a character swap, an AI influencer moment, a format that already worked here).
- rhythm: recommended posting days (0 = Sunday … 6 = Saturday), 1 to 3 local times "HH:MM" in the creator's time zone, and one sentence explaining why, based on the account's best slots and a sustainable pace.

Never name another AI tool, app or brand. Address the creator informally (tu in French and Spanish).`;

export async function analyzeTikTokAccount(handle: string, timezone: string, locale: Locale) {
  const items = await fetchProfile(handle);
  if (!items.length) return null;

  const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const videos: TikTokVideo[] = items.slice(0, MAX_VIDEOS).map((v) => ({
    url: v.webVideoUrl!,
    views: v.playCount ?? 0,
    likes: v.diggCount ?? 0,
    comments: v.commentCount ?? 0,
    shares: v.shareCount ?? 0,
    seconds: v.videoMeta?.duration ?? 0,
    postedAt: v.createTimeISO ?? "",
    caption: (v.text ?? "").replace(/\s+/g, " ").slice(0, 200),
  }));
  const medianViews = Math.round(median(videos.map((v) => v.views)));
  const engagement = median(videos.filter((v) => v.views > 0).map((v) => (v.likes + v.comments + v.shares) / v.views));
  const times = videos.map((v) => Date.parse(v.postedAt)).filter(Number.isFinite);
  const spanWeeks = times.length > 1 ? Math.max(1, (Math.max(...times) - Math.min(...times)) / (7 * 86_400_000)) : 1;
  const stats: TikTokStats = {
    handle,
    followers: items[0].authorMeta?.fans ?? 0,
    videos: videos.length,
    medianViews,
    engagement: Math.round(engagement * 1000) / 10,
    postsPerWeek: Math.round((videos.length / spanWeeks) * 10) / 10,
    top: [...videos].sort((a, b) => b.views - a.views).slice(0, 3),
  };

  const lines = videos.map((v, i) => {
    const when = v.postedAt ? dayFmt.format(new Date(v.postedAt)) : "?";
    const ratio = medianViews ? (v.views / medianViews).toFixed(1) : "?";
    return `${i + 1}. ${v.postedAt.slice(0, 10)} (${when} local) · ${v.seconds}s · ${v.views} views (${ratio}x median) · ${v.likes} likes · ${v.comments} comments · ${v.shares} shares · "${v.caption}"`;
  });
  const prompt = [
    `Account: @${handle}, ${stats.followers} followers, time zone ${timezone}.`,
    `Latest ${videos.length} videos, newest first. Median views: ${medianViews}. Median engagement: ${stats.engagement}%. Pace: ${stats.postsPerWeek} posts per week.`,
    lines.join("\n"),
    `Write every text field in ${LANGUAGE[locale]}.`,
  ].join("\n\n");

  const response = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  console.info("tiktok-analysis: usage", JSON.stringify(response.usage));
  const r = response.parsed_output;
  if (!r) throw new Error(`bilan vide (${response.stop_reason})`);

  const weekdays = [...new Set(r.rhythm.weekdays.map(Math.round))].filter((d) => d >= 0 && d <= 6).sort();
  const slots = [...new Set(r.rhythm.times.filter(isTime))].sort().slice(0, 3);
  const report: TikTokReport = {
    summary: r.summary,
    potential: { score: Math.round(Math.min(100, Math.max(0, r.potential.score))), note: r.potential.note },
    keep: r.keep.slice(0, 4),
    stop: r.stop.slice(0, 3),
    nextVideos: r.nextVideos.slice(0, 3),
    rhythm: { weekdays: weekdays.length ? weekdays : [1, 3, 5], times: slots.length ? slots : ["18:00"], reason: r.rhythm.reason },
  };
  return { stats, report };
}
