import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

// Tendances TikTok par pays, via des extracteurs Apify (non officiels : TikTok
// n'a pas d'API de tendances ouverte aux entreprises) :
// - hashtags du Creative Center (data_xplorer/tiktok-trends, ~0,025 $ + 0,0015 $
//   par hashtag) ;
// - vidéos les plus vues d'un hashtag (clockworks/tiktok-hashtag-scraper,
//   ~0,003 $ par vidéo).
// Claude trie les hashtags utiles aux créateurs TwinPost. Tout est gardé 6 h.
const HASHTAG_ACTOR = "data_xplorer~tiktok-trends";
const VIDEO_ACTOR = "clockworks~tiktok-hashtag-scraper";
const CACHE_MS = 6 * 3_600_000;
const FETCHED = 30;
// Vidéos gardées : publiées depuis moins de 3 semaines.
const VIDEO_MAX_AGE_MS = 21 * 86_400_000;

// Pays des tendances par défaut, selon la langue du site.
const REGION: Record<Locale, string> = { fr: "FR", en: "US", es: "ES" };
export function trendRegion(locale: Locale) {
  return REGION[locale];
}

export function tiktokTrendsEnabled() {
  return Boolean(process.env.APIFY_TOKEN);
}

export type TikTokHashtag = {
  rank: number;
  hashtag: string;
  posts: number;
  views: number;
  industries: string[];
  direction: string | null;
  url: string;
  // Intérêt jour par jour sur la période (0 à 100).
  curve: number[];
};

// Hashtag retenu pour TwinPost, avec l'idée de vidéo qui va avec.
export type TrendPick = TikTokHashtag & { angle: string };

export type TrendVideo = {
  id: string;
  hashtag: string;
  url: string;
  cover: string;
  views: number;
  likes: number;
  createdAt: string;
  caption: string;
  sound: string | null;
  seconds: number;
};

// Résultat gardé en base `CACHE_MS` ; l'ancien sert encore si le
// rafraîchissement échoue.
async function cached<T>(key: string, load: () => Promise<T>, keep: (value: T) => boolean): Promise<T> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("trend_cache").select("data, fetched_at").eq("key", key).maybeSingle();
  if (row && Date.now() - Date.parse(row.fetched_at) < CACHE_MS) return row.data as unknown as T;
  try {
    const value = await load();
    if (keep(value)) {
      await admin
        .from("trend_cache")
        .upsert({ key, data: value as unknown as Json, fetched_at: new Date().toISOString() });
    }
    return value;
  } catch (e) {
    if (row) return row.data as unknown as T;
    throw e;
  }
}

async function runActor<T>(actor: string, input: Record<string, unknown>): Promise<T[]> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=150&memory=1024`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Apify ${actor} : ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
  }
  return (await response.json()) as T[];
}

type RawHashtag = {
  Rank?: number;
  Hashtag?: string;
  Posts?: number;
  "Video Views"?: number;
  Industries?: string[];
  "Trend Direction"?: string;
  "TikTok URL"?: string;
  "Trend Data"?: { value?: number }[];
};

// Les créateurs mis en avant par le Creative Center (des particuliers) ne sont
// ni gardés ni montrés : seuls les hashtags comptent ici.
function normalizeHashtags(items: RawHashtag[]): TikTokHashtag[] {
  return items
    .filter((h) => h.Hashtag)
    .map((h) => ({
      rank: h.Rank ?? 0,
      hashtag: h.Hashtag!,
      posts: h.Posts ?? 0,
      views: h["Video Views"] ?? 0,
      industries: h.Industries ?? [],
      direction: h["Trend Direction"] ?? null,
      url: h["TikTok URL"] ?? `https://www.tiktok.com/tag/${encodeURIComponent(h.Hashtag!.replace(/^#/, ""))}`,
      curve: (h["Trend Data"] ?? []).map((p) => Math.round(p.value ?? 0)),
    }));
}

export async function tiktokTrends(input: { countryCode: string; period: "7" | "30"; onlyNew: boolean }) {
  const country = input.countryCode.toUpperCase();
  return cached(
    `tiktok:${country}:${input.period}:${input.onlyNew ? "new" : "all"}`,
    async () =>
      normalizeHashtags(
        await runActor<RawHashtag>(HASHTAG_ACTOR, {
          countryCode: country,
          period: input.period,
          sortBy: "popular",
          showOnlyNew: input.onlyNew,
          maxHashtags: FETCHED,
        }),
      ),
    (list) => list.length > 0,
  );
}

const PicksSchema = z.object({
  picks: z.array(z.object({ hashtag: z.string(), angle: z.string() })),
});

const LANGUAGE: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

// Hashtags utiles à un créateur TwinPost (remplacement de personnage dans une
// vidéo), avec une idée de vidéo par hashtag. Sans réponse de Claude : les
// premiers hashtags, sans idée.
export async function trendPicks(locale: Locale): Promise<TrendPick[]> {
  const country = trendRegion(locale);
  return cached(
    `picks:${country}:${locale}`,
    async () => {
      const hashtags = await tiktokTrends({ countryCode: country, period: "7", onlyNew: false });
      try {
        const response = await new Anthropic().beta.messages.parse({
          model: "claude-opus-5-5",
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: betaZodOutputFormat(PicksSchema) },
          system: `You pick TikTok trends that creators of TwinPost can use. TwinPost replaces a person in a filmed clip with any character from a photo, keeping the moves, set, camera and sound.

Keep: fictional characters (anime, games, films, series, cartoons), memes, sounds, dances, video formats, challenges, aesthetics.
Exclude: news, real private people, crimes, accidents, politics, religion, anything about minors, brands, ads and shopping, sports results.

Return at most 8 picks, most useful first, using the hashtags exactly as given. For each, "angle" is one short sentence in ${LANGUAGE[locale]} (under 80 characters) saying which video to make with TwinPost.`,
          messages: [
            {
              role: "user",
              content: JSON.stringify(
                hashtags.map(({ hashtag, views, industries, direction }) => ({ hashtag, views, industries, direction })),
              ),
            },
          ],
        });
        const picks = response.parsed_output?.picks ?? [];
        const chosen = picks
          .map((p) => {
            const tag = hashtags.find((h) => h.hashtag.toLowerCase() === p.hashtag.toLowerCase());
            return tag ? { ...tag, angle: p.angle.slice(0, 120) } : null;
          })
          .filter((p): p is TrendPick => p !== null);
        if (chosen.length) return chosen.slice(0, 8);
      } catch (e) {
        console.error("trendPicks", e instanceof Error ? e.message : e);
      }
      return hashtags.slice(0, 8).map((h) => ({ ...h, angle: "" }));
    },
    (list) => list.some((p) => p.angle),
  );
}

type RawVideo = {
  id?: string;
  text?: string;
  createTimeISO?: string;
  isAd?: boolean;
  isSponsored?: boolean;
  isSlideshow?: boolean;
  webVideoUrl?: string;
  playCount?: number;
  diggCount?: number;
  musicMeta?: { musicName?: string; musicAuthor?: string; musicOriginal?: boolean };
  videoMeta?: { coverUrl?: string; duration?: number };
  searchHashtag?: { name?: string };
};

// Vidéos les plus vues de ces hashtags ces 3 dernières semaines (`perTag` par
// hashtag). Seuls le lien, la couverture, les chiffres et le son sont gardés,
// pas le compte de l'auteur.
export async function hashtagVideos(hashtags: string[], perTag = 2): Promise<TrendVideo[]> {
  const tags = [...new Set(hashtags.map((h) => h.replace(/^#/, "").toLowerCase()).filter(Boolean))].slice(0, 4);
  if (!tags.length) return [];
  const list = await cached(
    `videos:${tags.join(",")}:${perTag}`,
    async () => {
      const raw = await runActor<RawVideo>(VIDEO_ACTOR, { hashtags: tags, resultsPerPage: 8 });
      const recent = raw.filter(
        (v) =>
          v.webVideoUrl &&
          v.videoMeta?.coverUrl &&
          !v.isAd &&
          !v.isSponsored &&
          !v.isSlideshow &&
          v.createTimeISO &&
          Date.now() - Date.parse(v.createTimeISO) < VIDEO_MAX_AGE_MS,
      );
      // Une vidéo qui porte plusieurs de ces hashtags n'est montrée qu'une fois.
      const seen = new Set<string>();
      return tags.flatMap((tag) =>
        recent
          .filter((v) => v.searchHashtag?.name?.toLowerCase() === tag && !seen.has(v.id ?? v.webVideoUrl!))
          .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
          .slice(0, perTag)
          .map((v) => {
            seen.add(v.id ?? v.webVideoUrl!);
            return v;
          })
          .map((v) => ({
            id: v.id ?? v.webVideoUrl!,
            hashtag: `#${tag}`,
            url: v.webVideoUrl!,
            cover: v.videoMeta!.coverUrl!,
            views: v.playCount ?? 0,
            likes: v.diggCount ?? 0,
            createdAt: v.createTimeISO!,
            caption: (v.text ?? "").slice(0, 140),
            sound:
              v.musicMeta?.musicOriginal || !v.musicMeta?.musicName
                ? null
                : [v.musicMeta.musicName, v.musicMeta.musicAuthor].filter(Boolean).join(" · "),
            seconds: v.videoMeta?.duration ?? 0,
          })),
      );
    },
    (list) => list.length > 0,
  );
  // Listes déjà en cache d'avant le dédoublonnage.
  return list.filter((v, i) => list.findIndex((o) => o.id === v.id) === i);
}
