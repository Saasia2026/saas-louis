"use server";

import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createFalCharacterSheet, falEnabled, uploadToFal } from "@/lib/fal";
import {
  DEFAULT_SWAP_ENGINE,
  SWAP_ENGINES,
  SWAP_INPUTS_BUCKET,
  genjutsuBilledSeconds,
  isSwapEngine,
  klingBilledSeconds,
  swapShotCredits,
  type AspectRatio,
  type SwapEngine,
} from "@/lib/generation";
import { higgsfieldEnabled, uploadToHiggsfield } from "@/lib/higgsfield";
import {
  errorMessage,
  isContentRefused,
  isOutOfCredit,
  isRateLimited,
} from "@/lib/predictions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  SWAP_PART_MIN_SECONDS,
  advanceSwap,
  firstFrame,
  preparePart,
  probeVideo,
  splitIntoParts,
  type SwapMetadata,
  type SwapPart,
} from "@/lib/swap";

// Morceaux préparés (ffmpeg, envoi) en même temps, au plus.
const PREPARE_BATCH = 4;

async function mapInBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const INPUT_URL_TTL_SECONDS = 60 * 60;

// Remplacement de personnage : le clip et l'image sont déjà déposés dans
// swap-inputs par le navigateur. On mesure le clip, on le découpe plan par
// plan, on débite, puis chaque plan avance en trois étapes (image clé,
// vidéo, contrôle) à chaque suivi de getGeneration (voir advanceSwap). Avec
// le moteur genjutsu, le passage est rendu en séquences (voir swap.ts).
export async function startSwap(input: {
  videoPath: string;
  imagePath: string;
  engine?: SwapEngine;
  // Début du passage gardé, en secondes, pour un clip trop long.
  start?: number;
  // Durée du passage voulue, en secondes (au plus celle du moteur).
  seconds?: number;
  // Qui remplacer, quand plusieurs personnes sont à l'image.
  target?: string;
}): Promise<Result<{ generationId: string; aspectRatio: AspectRatio; durationSeconds: number }>> {
  const t = await getDictionary();
  const errors = t.generateErrors;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };
  if (!falEnabled()) return { error: errors.startFailed };
  const engine = isSwapEngine(input.engine) ? input.engine : DEFAULT_SWAP_ENGINE;
  if (engine === "genjutsu" && !higgsfieldEnabled()) return { error: errors.startFailed };
  const genjutsu = engine === "genjutsu";

  // Chemins sous le dossier de l'utilisateur uniquement.
  const own = (p: unknown) =>
    typeof p === "string" && p.startsWith(`${userId}/`) && !p.includes("..");
  if (!own(input.videoPath) || !own(input.imagePath)) return { error: errors.swapFiles };

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from(SWAP_INPUTS_BUCKET)
    .createSignedUrls([input.videoPath, input.imagePath], INPUT_URL_TTL_SECONDS);
  const [sourceUrl, imageUrl] = (signed ?? []).map((s) => s.signedUrl);
  if (!sourceUrl || !imageUrl) return { error: errors.swapFiles };

  const probe = await probeVideo(sourceUrl).catch((e) => {
    console.error("probeVideo", errorMessage(e));
    return null;
  });
  if (!probe) return { error: errors.swapUnreadable };

  // Passage gardé : au plus la durée du moteur à partir de `start`. Une
  // fraction de seconde au-delà de la limite est tolérée (arrondi).
  const start =
    typeof input.start === "number" && Number.isFinite(input.start)
      ? Math.min(Math.max(0, input.start), Math.max(0, probe.seconds - 1))
      : 0;
  const clipSeconds = Math.min(
    probe.seconds - start,
    SWAP_ENGINES[engine].maxSeconds,
    typeof input.seconds === "number" && Number.isFinite(input.seconds)
      ? Math.max(SWAP_PART_MIN_SECONDS, input.seconds)
      : Infinity,
  );
  if (clipSeconds < SWAP_PART_MIN_SECONDS) {
    return { error: fmt(errors.swapTooShort, { min: SWAP_PART_MIN_SECONDS }) };
  }
  const durationSeconds = Math.max(1, Math.round(clipSeconds));
  const target = typeof input.target === "string" ? input.target.slice(0, 200) : undefined;

  // Découpage seul (rien de payant) : il fixe le prix. Kling : un morceau par
  // plan. Genjutsu : des séquences de quelques secondes.
  const shots = await splitIntoParts(sourceUrl, start, clipSeconds, engine).catch((e) => {
    console.error("startSwap: découpage", errorMessage(e));
    return null;
  });
  if (!shots?.length) return { error: errors.swapUnreadable };

  const metadata = {
    engine,
    aspect_ratio: probe.aspectRatio,
    source_video_path: input.videoPath,
    source_start: start,
    character_image_path: input.imagePath,
    started_at: new Date().toISOString(),
    ...(target && { target }),
  };
  const { data: generationId, error: rpcError } = await admin.rpc("start_swap_generation", {
    p_user_id: userId,
    p_duration_seconds: durationSeconds,
    // Les morceaux sont réencodés à 30 images/s.
    p_frames_per_second: 30,
    p_metadata: metadata,
    p_engine: engine,
    // Secondes réellement facturées par le moteur, une fois le clip découpé.
    p_billed_seconds: (genjutsu ? genjutsuBilledSeconds : klingBilledSeconds)(
      shots.map((s) => s.seconds),
    ),
  });
  if (rpcError || !generationId) {
    if (rpcError?.message.includes("insufficient_credits")) {
      return { error: errors.insufficientCredits };
    }
    console.error("start_swap_generation", errorMessage(rpcError));
    return { error: errors.startFailed };
  }

  try {
    // En même temps, pour ne pas faire attendre : les morceaux du clip et la
    // fiche du personnage.
    const [parts, character] = await Promise.all([
      // Kling : chaque plan avec sa première image (pour l'image clé), déposés
      // chez fal (Kling ne lit pas les URLs signées de Supabase). Genjutsu :
      // chaque séquence, déposée chez Higgsfield.
      mapInBatches(shots, PREPARE_BATCH, async (shot): Promise<SwapPart> => {
        if (genjutsu) {
          const clip = await preparePart(sourceUrl, start + shot.start, shot.seconds, "genjutsu");
          return { ...shot, videoUrl: await uploadToHiggsfield(clip, "video/mp4"), stage: "video" };
        }
        const clip = await preparePart(sourceUrl, start + shot.start, shot.seconds);
        const frame = await firstFrame(clip);
        const [videoUrl, firstFrameUrl] = await Promise.all([
          uploadToFal(clip, "video/mp4"),
          uploadToFal(frame.png, "image/png"),
        ]);
        return {
          ...shot,
          videoUrl,
          firstFrameUrl,
          width: frame.width,
          height: frame.height,
          stage: "keyframe",
        };
      }),
      (async () => {
        const image = await fetch(imageUrl);
        if (!image.ok) throw new Error(`Image du personnage : ${image.status}`);
        const characterUrl = await uploadToFal(
          await image.arrayBuffer(),
          image.headers.get("content-type") ?? "image/png",
        );
        // Fiche personnage, commune à tous les plans. Sans elle, l'image
        // déposée sert de face.
        const sheet = await createFalCharacterSheet(characterUrl).catch((e) => {
          if (isOutOfCredit(e)) throw e;
          console.error("createFalCharacterSheet", errorMessage(e));
          return null;
        });
        // Genjutsu reçoit la fiche (fond uni, sans accessoire) depuis le
        // stockage de Higgsfield ; sans fiche, l'image déposée.
        const urls = genjutsu
          ? await Promise.all(
              [sheet?.frontUrl ?? characterUrl, sheet?.sideUrl]
                .filter((u): u is string => Boolean(u))
                .map(async (u) => {
                  const file = await fetch(u);
                  if (!file.ok) throw new Error(`Image de la fiche : ${file.status}`);
                  return uploadToHiggsfield(
                    await file.arrayBuffer(),
                    file.headers.get("content-type")?.split(";")[0] ?? "image/png",
                  );
                }),
            )
          : undefined;
        return { sheet: { frontUrl: sheet?.frontUrl ?? characterUrl, sideUrl: sheet?.sideUrl }, urls };
      })(),
    ]);
    // Gardé sur « pending » : une génération déjà remboursée (préparation
    // trop longue, voir GeneratePage) n'est pas relancée.
    const { data: updated, error: updateError } = await admin
      .from("generations")
      .update({
        status: "processing",
        metadata: {
          ...metadata,
          sheet: character.sheet,
          ...(character.urls && { character_urls: character.urls }),
          swap_parts: parts,
          rev: 0,
        },
      })
      .eq("id", generationId)
      .eq("status", "pending")
      .select("id");
    if (updateError || !updated?.length) {
      throw new Error(`generations.update : ${updateError?.message ?? "génération déjà close"}`);
    }
    // Lance tout de suite les premiers rendus ; le suivi fait le reste.
    await advanceSwap(generationId);
  } catch (e) {
    console.error("startSwap", errorMessage(e));
    await admin.rpc("fail_generation", { p_generation_id: generationId });
    return {
      error: isOutOfCredit(e)
        ? errors.outOfCredit
        : isContentRefused(e)
          ? errors.contentRefused
          : isRateLimited(e)
            ? errors.rateLimited
            : errors.startFailed,
    };
  }

  return { data: { generationId, aspectRatio: probe.aspectRatio, durationSeconds } };
}

// Refait un seul plan d'un remplacement terminé : avec kling, une nouvelle
// image clé (fidèle à celle du premier plan) ; avec genjutsu, la séquence. Le plan est débité à part ; s'il rate,
// la vidéo garde l'ancien plan et son prix est rendu (voir abandonRedo).
export async function redoSwapShot(input: {
  generationId: string;
  index: number;
}): Promise<Result<{ aspectRatio: AspectRatio; durationSeconds: number }>> {
  const t = await getDictionary();
  const errors = t.generateErrors;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };

  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, status, duration_seconds, metadata")
    .eq("id", input.generationId)
    .eq("user_id", userId)
    .eq("kind", "swap")
    .maybeSingle();
  const metadata = (generation?.metadata ?? {}) as SwapMetadata & { aspect_ratio?: AspectRatio };
  const parts = metadata.swap_parts ?? [];
  const part = parts[input.index];
  if (!generation || generation.status !== "completed" || !part?.clipPath || !part.videoUrl) {
    return { error: errors.swapRedoUnavailable };
  }
  const genjutsu = metadata.engine === "genjutsu";

  const credits = swapShotCredits(part.seconds, genjutsu ? "genjutsu" : "kling");
  const { error: rpcError } = await admin.rpc("start_swap_redo", {
    p_user_id: userId,
    p_generation_id: generation.id,
    p_credits: credits,
  });
  if (rpcError) {
    if (rpcError.message.includes("insufficient_credits")) {
      return { error: errors.insufficientCredits };
    }
    console.error("start_swap_redo", errorMessage(rpcError));
    return { error: errors.swapRedoUnavailable };
  }

  parts[input.index] = {
    start: part.start,
    seconds: part.seconds,
    videoUrl: part.videoUrl,
    firstFrameUrl: part.firstFrameUrl,
    width: part.width,
    height: part.height,
    // Genjutsu repart de la séquence d'origine, sans image clé.
    stage: genjutsu ? "video" : "keyframe",
    redo: { previousClipPath: part.clipPath, credits },
  };
  const { error: updateError } = await admin
    .from("generations")
    .update({
      metadata: {
        ...metadata,
        swap_parts: parts,
        started_at: new Date().toISOString(),
        busy_until: null,
      },
    })
    .eq("id", generation.id);
  if (updateError) {
    // Plan non relancé : son prix est rendu, la vidéo reste terminée.
    console.error("redoSwapShot", updateError.message);
    await admin.rpc("refund_swap_redo", { p_generation_id: generation.id, p_credits: credits });
    await admin
      .from("generations")
      .update({ status: "completed" })
      .eq("id", generation.id)
      .eq("status", "processing");
    return { error: errors.swapRedoUnavailable };
  }
  await advanceSwap(generation.id).catch((e) => console.error("redoSwapShot", errorMessage(e)));

  return {
    data: {
      aspectRatio: metadata.aspect_ratio ?? "9:16",
      durationSeconds: generation.duration_seconds ?? 15,
    },
  };
}
