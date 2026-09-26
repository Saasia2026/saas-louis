"use server";

import { fmt } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import {
  GENERATIONS_BUCKET,
  type GenerationStatus,
  type SwapEngine,
} from "@/lib/generation";
import {
  CONTENT_REFUSED_ERROR,
  GENJUTSU_UNAVAILABLE_ERROR,
  OUT_OF_CREDIT_ERROR,
  errorMessage,
} from "@/lib/predictions";
import { advanceSwap, type SwapMetadata } from "@/lib/swap";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Messages d'erreur enregistrés en base (en français) : traduits à l'affichage.
function translateStoredError(error: string | null, t: Dictionary) {
  if (!error) return undefined;
  if (error === OUT_OF_CREDIT_ERROR) return t.generateErrors.outOfCredit;
  if (error === CONTENT_REFUSED_ERROR) return t.generateErrors.contentRefused;
  if (error === GENJUTSU_UNAVAILABLE_ERROR) return t.generateErrors.genjutsuUnavailable;
  return error;
}

export type GenerationView = {
  status: GenerationStatus;
  stage: "image" | "assembling";
  // Moteur du remplacement : genjutsu rend le passage d'un bloc, sans étapes.
  engine: SwapEngine;
  // Plans du passage (un seul avec genjutsu) : images clés prêtes, puis plans
  // rendus et contrôlés.
  shotsTotal: number;
  framesDone: number;
  shotsDone: number;
  // Plans refaisables un par un (redoSwapShot).
  parts: { start: number; seconds: number; flagged: boolean }[];
  mediaUrl?: string;
  downloadUrl?: string;
  // Raison de l'échec, quand elle est connue.
  error?: string;
  // Échec du moteur Qualité max seul : le studio propose l'Économique.
  tryBudget?: boolean;
  // Plan refait qui a raté : la vidéo n'a pas changé, et pourquoi.
  notice?: string;
};

// État d'un remplacement. Sans webhook joignable, c'est aussi ici qu'il
// avance (voir advanceSwap).
export async function getGeneration(generationId: string): Promise<Result<GenerationView>> {
  const supabase = await createClient();
  const select = () =>
    supabase
      .from("generations")
      .select("stage, status, storage_path, error, metadata")
      .eq("id", generationId)
      .eq("kind", "swap")
      .maybeSingle();

  const t = await getDictionary();
  const { data: initial } = await select();
  if (!initial) return { error: t.generateErrors.notFound };
  let generation = initial;

  if (generation.status === "processing") {
    try {
      await advanceSwap(generationId);
      const { data: fresh } = await select();
      if (fresh) generation = fresh;
    } catch (e) {
      console.error("getGeneration", errorMessage(e));
    }
  }

  const metadata = (generation.metadata ?? {}) as SwapMetadata;
  const parts = metadata.swap_parts ?? [];
  const genjutsu = metadata.engine === "genjutsu";
  const failedRedo = parts.findIndex((p) => p.redoFailed);
  const view: GenerationView = {
    status: generation.status as GenerationStatus,
    stage: generation.stage === "assembling" ? "assembling" : "image",
    engine: genjutsu ? "genjutsu" : "kling",
    shotsTotal: parts.length,
    framesDone: parts.filter((p) => p.keyframeUrl).length,
    shotsDone: parts.filter((p) => p.stage === "done").length,
    parts: parts.map((p) => ({ start: p.start, seconds: p.seconds, flagged: Boolean(p.check) })),
    error: translateStoredError(generation.error, t),
    tryBudget: generation.error === GENJUTSU_UNAVAILABLE_ERROR,
    notice:
      failedRedo < 0
        ? undefined
        : fmt(
            parts[failedRedo].redoFailed === CONTENT_REFUSED_ERROR
              ? t.studio.redoRefused
              : t.studio.redoFailed,
            { part: fmt(genjutsu ? t.studio.sequence : t.studio.shot, { n: failedRedo + 1 }) },
          ),
  };

  if (view.status === "completed" && generation.storage_path) {
    const bucket = supabase.storage.from(GENERATIONS_BUCKET);
    const ext = generation.storage_path.split(".").pop();
    const [media, download] = await Promise.all([
      bucket.createSignedUrl(generation.storage_path, SIGNED_URL_TTL_SECONDS),
      bucket.createSignedUrl(generation.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: `twinpost-${generationId.slice(0, 8)}.${ext}`,
      }),
    ]);
    view.mediaUrl = media.data?.signedUrl;
    view.downloadUrl = download.data?.signedUrl;
  }

  return { data: view };
}
