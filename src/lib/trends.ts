import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Sélection du jour des bots du studio : vidéos TikTok d'influenceurs IA qui
// cartonnent, récoltées par Apify une fois par jour (voir
// /api/trends/tick), triées et commentées par Claude en trois langues.

export type TrendPick = {
  id: string;
  url: string;
  author: string;
  views: number;
  caption: string;
  hook: string;
  why: string;
  how: string;
};

type Localized = { fr: string; en: string; es: string };

// Dernière sélection disponible (celle du jour, ou la veille si la récolte
// du matin n'est pas encore passée), dans la langue de l'utilisateur.
export async function listTrendPicks(locale: Locale): Promise<TrendPick[]> {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("trend_picks")
    .select("day")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return [];
  const { data } = await supabase
    .from("trend_picks")
    .select("id, url, author, views, caption, hook, why, how")
    .eq("day", latest.day)
    .order("rank", { ascending: true });
  const pick = (v: unknown) => ((v as Localized | null)?.[locale] ?? "").trim();
  return (data ?? []).map((r) => ({
    id: r.id,
    url: r.url,
    author: r.author,
    views: r.views,
    caption: r.caption,
    hook: pick(r.hook),
    why: pick(r.why),
    how: pick(r.how),
  }));
}

// --- Récolte quotidienne -------------------------------------------------

// 4 hashtags x 10 vidéos = 40 résultats à 0,0037 $ : environ 0,15 $ par jour,
// sous les 5 $ mensuels offerts par Apify. Plafond de dépense par passage.
const HASHTAGS = ["aiinfluencer", "virtualinfluencer", "aiinfluencers", "aivlog"];
const PER_HASHTAG = 10;
const MAX_CHARGE_USD = 0.25;
const MAX_AGE_DAYS = 120;
const MIN_VIEWS = 30_000;
const CANDIDATES = 25;
const MAX_PICKS = 8;

type TikTokItem = {
  id?: string;
  text?: string;
  webVideoUrl?: string;
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  shareCount?: number;
  isAd?: boolean;
  isSponsored?: boolean;
  isSlideshow?: boolean;
  authorMeta?: { name?: string; fans?: number };
  videoMeta?: { duration?: number };
};

async function fetchTikTok(): Promise<TikTokItem[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN manquant");
  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?maxTotalChargeUsd=${MAX_CHARGE_USD}&timeout=240`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        hashtags: HASHTAGS,
        resultsPerPage: PER_HASHTAG,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      }),
      signal: AbortSignal.timeout(260_000),
    },
  );
  if (!res.ok) throw new Error(`Apify ${res.status}`);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as TikTokItem[]) : [];
}

const LocalizedSchema = z.object({ fr: z.string(), en: z.string(), es: z.string() });
const PicksSchema = z.object({
  picks: z.array(
    z.object({
      id: z.string(),
      hook: LocalizedSchema,
      why: LocalizedSchema,
      how: LocalizedSchema,
    }),
  ),
});

const SYSTEM = `You curate a daily selection for TwinPost, a web app for creators. TwinPost replaces a person in a real video clip with any character from a photo, keeping the gestures, camera, set and sound ("Replace" mode), or rebuilds the whole scene from the clip's movements ("Motion transfer" mode). It also has an "AI influencer" page that creates a character in one image. Users want to make ultra-viral AI influencer and AI character videos.

You receive TikTok videos posted under AI influencer hashtags, with their caption and numbers. Pick up to ${MAX_PICKS} that would best inspire a TwinPost user to make a viral AI influencer or AI character video, best first. Favour formats a user can redo with their own footage: character swaps in real scenes, AI influencer daily life and vlogs, "is she real?" reveals, recurring characters, trends with a clear twist.

Leave out: videos built on real celebrities, politicians or athletes; sexual or suggestive content; anything involving minors; pure software tutorials or tool reviews; promotions for other apps.

For each pick write, in French, English and Spanish:
- hook: a reusable opening line (on-screen text or first spoken line) in the spirit of the video, at most 70 characters, no hashtags, no emoji.
- why: one short sentence on why it works, based only on the caption and the numbers. Do not invent visual details you cannot know.
- how: one short sentence on how to redo it in TwinPost, naming the mode or page: French "Remplacer", "Transférer le mouvement", "Influenceur IA"; English "Replace", "Motion transfer", "AI influencer"; Spanish "Reemplazar", "Transferir el movimiento", "Influencer IA".

Address the creator informally (tu in French and Spanish). Never name another AI tool, app or brand in your texts. Use the exact id given for each video.`;

const fmtNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

// Récolte, tri et écriture de la sélection du jour. Idempotent : relancée
// le même jour, elle remplace la sélection.
export async function refreshTrendPicks() {
  const items = await fetchTikTok();
  const since = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const seen = new Set<string>();
  const candidates = items
    .filter((v) => {
      if (!v.id || !v.webVideoUrl || seen.has(v.id)) return false;
      seen.add(v.id);
      if (v.isAd || v.isSponsored || v.isSlideshow) return false;
      if ((v.playCount ?? 0) < MIN_VIEWS) return false;
      const t = v.createTimeISO ? Date.parse(v.createTimeISO) : 0;
      return t >= since;
    })
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, CANDIDATES);
  if (!candidates.length) throw new Error(`aucune vidéo retenue sur ${items.length} récoltées`);

  const list = candidates
    .map((v) =>
      [
        `id: ${v.id}`,
        `author: @${v.authorMeta?.name ?? "?"} (${fmtNum(v.authorMeta?.fans ?? 0)} followers)`,
        `views: ${fmtNum(v.playCount ?? 0)}, likes: ${fmtNum(v.diggCount ?? 0)}, shares: ${fmtNum(v.shareCount ?? 0)}`,
        `duration: ${v.videoMeta?.duration ?? "?"} s, posted: ${v.createTimeISO?.slice(0, 10) ?? "?"}`,
        `caption: ${(v.text ?? "").replace(/\s+/g, " ").slice(0, 300)}`,
      ].join("\n"),
    )
    .join("\n\n");

  const response = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(PicksSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Today's videos:\n\n${list}` }],
  });
  console.info("trends: usage", JSON.stringify(response.usage));
  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`sélection vide (${response.stop_reason})`);

  const byId = new Map(candidates.map((v) => [v.id!, v]));
  const day = new Date().toISOString().slice(0, 10);
  const rows = parsed.picks
    .filter((p) => byId.has(p.id))
    .slice(0, MAX_PICKS)
    .map((p, i) => {
      const v = byId.get(p.id)!;
      return {
        day,
        rank: i + 1,
        platform: "tiktok",
        video_id: v.id!,
        url: v.webVideoUrl!,
        author: v.authorMeta?.name ?? "",
        followers: v.authorMeta?.fans ?? null,
        views: v.playCount ?? 0,
        likes: v.diggCount ?? null,
        shares: v.shareCount ?? null,
        seconds: v.videoMeta?.duration ?? null,
        posted_at: v.createTimeISO ?? null,
        caption: (v.text ?? "").replace(/\s+/g, " ").slice(0, 300),
        hook: p.hook,
        why: p.why,
        how: p.how,
      };
    });
  if (!rows.length) throw new Error("aucune vidéo choisie");

  const admin = createAdminClient();
  await admin.from("trend_picks").delete().eq("day", day);
  const { error } = await admin.from("trend_picks").insert(rows);
  if (error) throw error;
  return { harvested: items.length, candidates: candidates.length, picks: rows.length };
}
