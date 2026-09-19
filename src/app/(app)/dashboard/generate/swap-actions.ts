"use server";

import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createFalCharacterSheet, falEnabled, uploadToFal } from "@/lib/fal";
import {
  DEFAULT_SWAP_ENGINE,
  SWAP_ENGINES,
  SWAP_INPUTS_BUCKET,
  isSwapEngine,
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

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const INPUT_URL_TTL_SECONDS = 60 * 60;

// Remplacement de personnage : le clip et l'image sont déjà déposés dans
// swap-inputs par le navigateur. On mesure le clip, on le découpe plan par
// plan, on débite, puis chaque plan avance en trois étapes (image clé,
// vidéo, contrôle) à chaque suivi de getGeneration (voir advanceSwap). Avec
// le moteur genjutsu, le passage entier est un seul plan (voir swap.ts).
export async function startSwap(input: {
  videoPath: string;
  imagePath: string;
  engine?: SwapEngine;
  // Début du passage gardé, en secondes, pour un clip trop long.
  start?: number;
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
  // Higgsfield facture la durée envoyée, arrondie à la seconde supérieure :
  // le passage est raccourci d'un souffle (et coupé à l'image près, voir
  // preparePart) pour ne pas basculer sur la seconde suivante à l'encodage,
  // et le prix suit le même arrondi.
  const clipSeconds =
    Math.min(probe.seconds - start, SWAP_ENGINES[engine].maxSeconds) - (genjutsu ? 0.05 : 0);
  if (clipSeconds < SWAP_PART_MIN_SECONDS) {
    return { error: fmt(errors.swapTooShort, { min: SWAP_PART_MIN_SECONDS }) };
  }
  const durationSeconds = Math.max(1, genjutsu ? Math.ceil(clipSeconds) : Math.round(clipSeconds));
  const target = typeof input.target === "string" ? input.target.slice(0, 200) : undefined;

  // Kling : un morceau par plan, avec sa première image (pour l'image clé).
  // Déposés chez fal : Kling ne lit pas les URLs signées de Supabase.
  // Genjutsu : le passage entier, déposé chez Higgsfield.
  let parts: SwapPart[];
  let characterUrl: string;
  try {
    const shots = genjutsu
      ? [{ start: 0, seconds: clipSeconds }]
      : await splitIntoParts(sourceUrl, start, clipSeconds);
    parts = await Promise.all(
      shots.map(async (shot): Promise<SwapPart> => {
        if (genjutsu) {
          const clip = await preparePart(sourceUrl, start, shot.seconds, "genjutsu");
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
    );
    const image = await fetch(imageUrl);
    if (!image.ok) throw new Error(`Image du personnage : ${image.status}`);
    characterUrl = await uploadToFal(
      await image.arrayBuffer(),
      image.headers.get("content-type") ?? "image/png",
    );
  } catch (e) {
    console.error("startSwap: découpage", errorMessage(e));
    return { error: errors.swapUnreadable };
  }

  const metadata = {
    engine,
    aspect_ratio: probe.aspectRatio,
    source_video_path: input.videoPath,
    source_start: start,
    character_image_path: input.imagePath,
    ...(target && { target }),
  };
  const { data: generationId, error: rpcError } = await admin.rpc("start_swap_generation", {
    p_user_id: userId,
    p_duration_seconds: durationSeconds,
    // Les morceaux sont réencodés à 30 images/s.
    p_frames_per_second: 30,
    p_metadata: metadata,
    p_engine: engine,
  });
  if (rpcError || !generationId) {
    if (rpcError?.message.includes("insufficient_credits")) {
      return { error: errors.insufficientCredits };
    }
    console.error("start_swap_generation", errorMessage(rpcError));
    return { error: errors.startFailed };
  }

  try {
    // Fiche personnage, commune à tous les plans. Sans elle, l'image déposée
    // sert de face.
    const sheet = await createFalCharacterSheet(characterUrl).catch((e) => {
      console.error("createFalCharacterSheet", errorMessage(e));
      return null;
    });
    // Genjutsu reçoit la fiche (fond uni, sans accessoire) depuis le stockage
    // de Higgsfield ; sans fiche, l'image déposée.
    const characterUrls = genjutsu
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
    await admin
      .from("generations")
      .update({
        status: "processing",
        metadata: {
          ...metadata,
          sheet: { frontUrl: sheet?.frontUrl ?? characterUrl, sideUrl: sheet?.sideUrl },
          ...(characterUrls && { character_urls: characterUrls }),
          swap_parts: parts,
          rev: 0,
        },
      })
      .eq("id", generationId);
    // Lance tout de suite l'image clé du premier plan ; le suivi fait le reste.
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

// Refait un seul plan d'un remplacement terminé, avec une nouvelle image clé
// (fidèle à celle du premier plan). Le plan est débité à part ; s'il rate,
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
  // Genjutsu rend le passage d'un bloc : pas de plan à refaire seul.
  if (
    !generation ||
    generation.status !== "completed" ||
    metadata.engine === "genjutsu" ||
    !part?.clipPath ||
    !part.videoUrl
  ) {
    return { error: errors.swapRedoUnavailable };
  }

  const credits = swapShotCredits(part.seconds);
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
    stage: "keyframe",
    redo: { previousClipPath: part.clipPath, credits },
  };
  await admin
    .from("generations")
    .update({ metadata: { ...metadata, swap_parts: parts, busy_until: null } })
    .eq("id", generation.id);
  await advanceSwap(generation.id).catch((e) => console.error("redoSwapShot", errorMessage(e)));

  return {
    data: {
      aspectRatio: metadata.aspect_ratio ?? "9:16",
      durationSeconds: generation.duration_seconds ?? 15,
    },
  };
}
