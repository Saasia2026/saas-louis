import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

// Hashtags en tendance sur TikTok par pays, tirés du Creative Center par un
// extracteur Apify (data_xplorer/tiktok-trends, non officiel : TikTok n'a pas
// d'API de tendances ouverte aux entreprises). Chaque appel est payant
// (~0,025 $ + 0,0015 $ par hashtag) : résultats gardés 6 h par pays.
const ACTOR = "data_xplorer~tiktok-trends";
const CACHE_MS = 6 * 3_600_000;
const FETCHED = 30;

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
function normalize(items: RawHashtag[]): TikTokHashtag[] {
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
  const key = `tiktok:${country}:${input.period}:${input.onlyNew ? "new" : "all"}`;
  const admin = createAdminClient();
  const { data: cached } = await admin.from("trend_cache").select("data, fetched_at").eq("key", key).maybeSingle();
  if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_MS) {
    return cached.data as unknown as TikTokHashtag[];
  }

  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=120&memory=1024`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        countryCode: country,
        period: input.period,
        sortBy: "popular",
        showOnlyNew: input.onlyNew,
        maxHashtags: FETCHED,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    // Ancien résultat plutôt que rien si l'extracteur est en panne.
    if (cached) return cached.data as unknown as TikTokHashtag[];
    throw new Error(`Apify : ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
  }
  const hashtags = normalize((await response.json()) as RawHashtag[]);
  if (hashtags.length) {
    await admin
      .from("trend_cache")
      .upsert({ key, data: hashtags as unknown as Json, fetched_at: new Date().toISOString() });
  }
  return hashtags;
}
