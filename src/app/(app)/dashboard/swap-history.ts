import "server-only";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  GENERATIONS_BUCKET,
  SWAP_INPUTS_BUCKET,
  isAspectRatio,
  type AspectRatio,
} from "@/lib/generation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type SwapHistoryItem = {
  id: string;
  running: boolean;
  mediaUrl?: string;
  downloadUrl?: string;
  seconds: number | null;
  // Séquences livrées avec leurs images d'origine : vidéo incomplète.
  incomplete?: string;
  aspectRatio: AspectRatio;
  date: string;
  hd: boolean;
  fidelity: boolean;
  // Photos des personnages, dans l'ordre.
  thumbs: string[];
};

type HistoryMetadata = {
  aspect_ratio?: unknown;
  hd?: boolean;
  vessel?: boolean;
  swap_parts?: { original?: boolean }[];
  character_image_path?: string;
  characters?: { image_path?: string }[];
};

// Remplacements terminés ou en cours de l'utilisateur, du plus récent au plus
// ancien. Un rendu en cours n'a pas encore de vidéo.
export async function listSwapHistory(limit = 24): Promise<SwapHistoryItem[]> {
  const [t, locale, supabase] = await Promise.all([getDictionary(), getLocale(), createClient()]);
  const { data: generations } = await supabase
    .from("generations")
    .select("id, status, storage_path, duration_seconds, metadata, created_at")
    .eq("kind", "swap")
    .in("status", ["completed", "processing"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (generations ?? []).map((g) => ({ ...g, meta: (g.metadata ?? {}) as HistoryMetadata }));

  // Les photos déposées se signent toutes d'un coup.
  const photoPaths = rows.map((g) =>
    (g.meta.characters?.map((c) => c.image_path) ?? [g.meta.character_image_path]).filter(
      (p): p is string => typeof p === "string",
    ),
  );
  const uniquePaths = [...new Set(photoPaths.flat())];
  const { data: signedPhotos } = uniquePaths.length
    ? await createAdminClient()
        .storage.from(SWAP_INPUTS_BUCKET)
        .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS)
    : { data: null };
  const photoUrl = new Map(
    (signedPhotos ?? []).flatMap((s) => (s.path && s.signedUrl && !s.error ? [[s.path, s.signedUrl]] : [])),
  );

  const bucket = supabase.storage.from(GENERATIONS_BUCKET);
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" });
  const items = await Promise.all(
    rows.map(async (g, i): Promise<SwapHistoryItem> => {
      const path = g.status === "completed" ? g.storage_path : null;
      const [media, download] = path
        ? await Promise.all([
            bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
            bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
              download: `twinpost-${g.id.slice(0, 8)}.${path.split(".").pop()}`,
            }),
          ])
        : [null, null];
      const parts = g.meta.swap_parts ?? [];
      const unreplaced = parts.filter((p) => p.original).length;
      return {
        id: g.id,
        running: g.status === "processing",
        mediaUrl: media?.data?.signedUrl,
        downloadUrl: download?.data?.signedUrl,
        seconds: g.duration_seconds,
        incomplete:
          g.status === "completed" && unreplaced > 0
            ? fmt(t.videos.incomplete, { done: parts.length - unreplaced, total: parts.length })
            : undefined,
        aspectRatio: isAspectRatio(g.meta.aspect_ratio) ? g.meta.aspect_ratio : "9:16",
        date: dateFormat.format(new Date(g.created_at)),
        hd: g.meta.hd === true,
        fidelity: g.meta.vessel === true,
        thumbs: photoPaths[i].flatMap((p) => photoUrl.get(p) ?? []),
      };
    }),
  );
  return items.filter((v) => v.running || v.mediaUrl);
}
