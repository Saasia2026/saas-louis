import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { getTwinAppearance } from "@/lib/appearance";
import {
  DEFAULT_PACE,
  GENERATIONS_BUCKET,
  PRESETS,
  findPreset,
  hasAudio,
  isAspectRatio,
  isDirectPreset,
  isPace,
  keptSeconds,
  shotDurations,
  type AspectRatio,
  type Pace,
  type Preset,
} from "@/lib/generation";
import {
  getPrediction,
  imageEngineOf,
  imagePrompt,
  startDirectShotVideo,
  startTextShotVideo,
  startShotVideo,
  startTwinImage,
  type ImageEngine,
} from "@/lib/providers";
import {
  copyOutputToStorage,
  errorMessage,
  isOutOfCredit,
  isRateLimited,
  isTerminal,
  outputUrlOf,
  type PredictionState,
} from "@/lib/replicate";
import { writeStoryboard, type Storyboard } from "@/lib/storyboard";
import { createAdminClient } from "@/lib/supabase/admin";

// Une vidéo = N plans, en deux temps qui s'enchaînent sans intervention :
// 1. stage 'frames' : chaque plan passe par la file d'attente puis l'image du
//    jumeau, copiée dans Storage ('framed').
// 2. stage 'shots' : dès que toutes les images sont prêtes, le modèle vidéo
//    choisi anime chaque image ('video'), le clip est copié dans Storage
//    ('done'), puis ffmpeg assemble le tout.
// Replicate limite la création de prédictions : les lancements se font un par
// un, fal prend le relais en cas de refus (429, voir providers.ts), et si lui
// aussi refuse, le plan reste en attente jusqu'au passage suivant.
// advanceVideoGeneration est idempotente : webhook et polling peuvent
// l'appeler en même temps, chaque transition est protégée par un update
// conditionnel.

// Chaque image a droit à un nouvel essai automatique en cas d'échec : un
// nombre impair de lancements signifie qu'il n'a pas encore eu lieu.
const MAX_IMAGE_ATTEMPTS = 10;
const MAX_VIDEO_ATTEMPTS = 2;
const MAX_END_IMAGE_ATTEMPTS = 2;
// Marge sous la limite de taille d'un fichier dans Supabase Storage (50 Mo).
const MAX_VIDEO_MB = 40;
export const OUT_OF_CREDIT_ERROR =
  "Le compte du service de génération n'a plus de crédit. Tes crédits ont été rendus.";
const FRAME_URL_TTL_SECONDS = 60 * 60;
// Le mouvement rapide n'est pas banni : seuls l'identité, les déformations et
// le rendu « film » le sont.
const NEGATIVE_PROMPT =
  "face change, different person, morphing, distorted face, extra limbs, blurry, text, watermark, slow motion, cinematic color grading, film look";
const execFileAsync = promisify(execFile);

type Shot = {
  id: string;
  position: number;
  duration_seconds: number;
  image_prompt: string;
  motion_prompt: string;
  stage: string;
  attempts: number;
  video_attempts: number;
  image_prediction_id: string | null;
  video_prediction_id: string | null;
  image_path: string | null;
  clip_path: string | null;
  end_image_prompt: string | null;
  end_image_attempts: number;
  end_image_prediction_id: string | null;
  end_image_path: string | null;
};

type VideoGeneration = {
  id: string;
  user_id: string;
  // null : vidéo sans jumeau, générée directement depuis le texte.
  twinId: string | null;
  twinModelVersion: string;
  aspectRatio: AspectRatio;
  preset: Preset;
  imageEngine: ImageEngine;
  pace: Pace;
  // Personnage Sora réutilisé dans chaque plan, et son nom pour le prompt.
  soraCharacterId: string | null;
  characterName: string | null;
};

// Graine commune à tous les plans d'une vidéo : des images plus proches
// d'un plan à l'autre (visage, lumière).
function seedOf(generationId: string) {
  return parseInt(generationId.slice(0, 8), 16) % 2 ** 31;
}

function framePath(generation: VideoGeneration, shot: Shot) {
  return `${generation.user_id}/${generation.id}/frame-${String(shot.position).padStart(3, "0")}`;
}

export async function startVideoGeneration(input: {
  generationId: string;
  userId: string;
  twinId: string | null;
  twinModelVersion: string;
  prompt: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  preset: Preset;
  imageEngine: ImageEngine;
  pace: Pace;
  soraCharacterId?: string | null;
  characterName?: string | null;
  direction?: string;
  // Storyboard déjà écrit (mode Director), un plan par tranche de durée.
  storyboard?: Storyboard;
}) {
  const admin = createAdminClient();
  const durations = shotDurations(input.durationSeconds, input.preset.id, input.pace);
  const twinId = input.twinId;
  const [storyboard, appearance] = await Promise.all([
    input.storyboard ??
      writeStoryboard(input.prompt, durations, input.direction, twinId ? "twin" : "free"),
    twinId ? getTwinAppearance(twinId) : "",
  ]);

  const { data: shots, error } = await admin
    .from("generation_shots")
    .insert(
      durations.map((duration, position) => ({
        generation_id: input.generationId,
        user_id: input.userId,
        position,
        duration_seconds: duration,
        summary: storyboard.shots[position].summary,
        image_prompt: twinId
          ? imagePrompt(input.imageEngine, {
              appearance,
              outfit: storyboard.subject,
              scene: storyboard.shots[position].scene,
            })
          : [storyboard.subject, storyboard.shots[position].scene].filter(Boolean).join(". "),
        motion_prompt: storyboard.shots[position].motion,
        end_image_prompt: twinId && input.preset.endFrames
          ? imagePrompt(input.imageEngine, {
              appearance,
              outfit: storyboard.subject,
              scene: storyboard.shots[position].end,
            })
          : null,
        stage: "queued",
      })),
    )
    .select("*");
  if (error) throw error;

  // Sans jumeau, ou avec un préréglage en vidéo directe, aucune image n'est
  // générée : les plans partent tout de suite en vidéo.
  const direct = !twinId || isDirectPreset(input.preset);
  await admin
    .from("generations")
    .update({ status: "processing", stage: direct ? "shots" : "frames", storyboard })
    .eq("id", input.generationId);

  const generation: VideoGeneration = {
    id: input.generationId,
    user_id: input.userId,
    twinId,
    twinModelVersion: input.twinModelVersion,
    aspectRatio: input.aspectRatio,
    preset: input.preset,
    imageEngine: input.imageEngine,
    pace: input.pace,
    soraCharacterId: input.soraCharacterId ?? null,
    characterName: input.characterName ?? null,
  };
  if (direct) await startDirectShots(generation, shots);
  else await startQueuedShots(generation, shots);
}

// ---------------------------------------------------------------------------
// Vidéo directe : chaque plan part des photos du jumeau, sans image de départ
// ---------------------------------------------------------------------------

async function startDirectShots(generation: VideoGeneration, shots: Shot[]) {
  for (const shot of shots) {
    if (shot.stage !== "queued") continue;
    if ((await startDirectShot(generation, shot)) === "throttled") return;
  }
}

async function startDirectShot(
  generation: VideoGeneration,
  shot: Shot,
): Promise<"ok" | "throttled"> {
  const admin = createAdminClient();
  const videoAttempts = shot.video_attempts + 1;

  // Verrou : un seul appelant lance ce plan.
  const { data: claimed } = await admin
    .from("generation_shots")
    .update({ stage: "video", video_attempts: videoAttempts, video_prediction_id: null })
    .eq("id", shot.id)
    .eq("stage", "queued")
    .select("id");
  if (!claimed?.length) return "ok";

  try {
    const twinId = generation.twinId;
    // Avec un personnage, chaque plan le nomme pour que Sora le reconnaisse.
    const named = generation.characterName
      ? `@${generation.characterName} is the main character. `
      : "";
    const shotInput = {
      videoModel: generation.preset.videoModel,
      aspectRatio: generation.aspectRatio,
      prompt: `${named}${shot.image_prompt} ${shot.motion_prompt}`,
      negativePrompt: NEGATIVE_PROMPT,
      durationSeconds: shot.duration_seconds,
      seed: seedOf(generation.id) + shot.position,
    };
    const predictionId = twinId
      ? await startDirectShotVideo({ ...shotInput, twinId })
      : await startTextShotVideo({
          ...shotInput,
          soraCharacterId: generation.soraCharacterId ?? undefined,
        });
    await admin
      .from("generation_shots")
      .update({ video_prediction_id: predictionId })
      .eq("id", shot.id);
    return "ok";
  } catch (e) {
    if (isOutOfCredit(e)) return failOutOfCredit(generation.id, e);
    if (isRateLimited(e)) {
      await admin
        .from("generation_shots")
        .update({ stage: "queued", video_attempts: shot.video_attempts })
        .eq("id", shot.id)
        .eq("stage", "video")
        .is("video_prediction_id", null);
      return "throttled";
    }
    console.error("startDirectShot", errorMessage(e));
    await videoRetryOrFail({
      ...shot,
      stage: "video",
      video_attempts: videoAttempts,
      video_prediction_id: null,
    });
    return "ok";
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Avec le moteur à références, le premier plan sert de modèle aux autres
// (tenue, objets, lieu) : ils attendent son image, sauf s'il a échoué. Le
// plan 2 part en même temps que le plan 1 pour gagner une attente : sa
// continuité repose alors sur le seul storyboard.
const PARALLEL_FIRST_SHOTS = 2;

async function startQueuedShots(generation: VideoGeneration, shots: Shot[]) {
  let continuityUrl: string | undefined;
  let waitForAnchor = false;
  if (generation.imageEngine === "reference" && shots.some((s) => s.position > 0)) {
    const anchor =
      shots.find((s) => s.position === 0) ??
      (await loadShots(generation.id)).find((s) => s.position === 0);
    if (anchor?.image_path) {
      continuityUrl = await signedFrameUrl(anchor.image_path);
    } else {
      waitForAnchor = anchor?.stage !== "failed";
    }
  }

  for (const shot of shots) {
    if (shot.stage !== "queued") continue;
    if (shot.position >= PARALLEL_FIRST_SHOTS && waitForAnchor) continue;
    const continuity = shot.position > 0 ? continuityUrl : undefined;
    if ((await startShotImage(generation, shot, continuity)) === "throttled") return;
  }
}

// Compte fournisseur sans crédit : inutile de laisser la vidéo en attente.
// Elle échoue tout de suite, les crédits sont rendus et le message le dit.
async function failOutOfCredit(generationId: string, e: unknown): Promise<"throttled"> {
  console.error("failOutOfCredit", errorMessage(e));
  const admin = createAdminClient();
  await admin.rpc("fail_generation", { p_generation_id: generationId });
  await admin
    .from("generations")
    .update({ error: OUT_OF_CREDIT_ERROR })
    .eq("id", generationId);
  return "throttled";
}

async function signedFrameUrl(imagePath: string) {
  const { data, error } = await createAdminClient()
    .storage.from(GENERATIONS_BUCKET)
    .createSignedUrl(imagePath, FRAME_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

// Lance l'image d'un plan en attente. Un échec autre qu'un 429 est traité
// comme une image ratée.
async function startShotImage(
  generation: VideoGeneration,
  shot: Shot,
  continuityUrl?: string,
): Promise<"ok" | "throttled"> {
  const admin = createAdminClient();
  const attempts = shot.attempts + 1;

  // Verrou : un seul appelant lance l'image de ce plan.
  const { data: claimed } = await admin
    .from("generation_shots")
    .update({ stage: "image", attempts, image_prediction_id: null })
    .eq("id", shot.id)
    .eq("stage", "queued")
    .select("id");
  if (!claimed?.length) return "ok";

  let predictionId: string;
  try {
    predictionId = await startTwinImage({
      engine: generation.imageEngine,
      preset: generation.preset,
      twinId: generation.twinId!,
      modelVersion: generation.twinModelVersion,
      prompt: shot.image_prompt,
      aspectRatio: generation.aspectRatio,
      // Chaque lancement change de graine, sinon il referait la même image.
      seed: seedOf(generation.id) + shot.attempts,
      continuityUrl,
    });
  } catch (e) {
    if (isOutOfCredit(e)) return failOutOfCredit(generation.id, e);
    if (isRateLimited(e)) {
      await admin
        .from("generation_shots")
        .update({ stage: "queued", attempts: shot.attempts })
        .eq("id", shot.id);
      return "throttled";
    }
    console.error("startShotImage", errorMessage(e));
    await imageRetryOrFail({ ...shot, stage: "image", attempts, image_prediction_id: null });
    return "ok";
  }

  const { error } = await admin
    .from("generation_shots")
    .update({ image_prediction_id: predictionId })
    .eq("id", shot.id);
  if (error) throw error;
  return "ok";
}

// Lance l'image de fin d'un plan, à partir de son image de départ : même
// tenue, même décor, autre moment de l'action.
async function startEndImage(generation: VideoGeneration, shot: Shot) {
  const admin = createAdminClient();
  try {
    const predictionId = await startTwinImage({
      engine: generation.imageEngine,
      preset: generation.preset,
      twinId: generation.twinId!,
      modelVersion: generation.twinModelVersion,
      prompt: shot.end_image_prompt!,
      aspectRatio: generation.aspectRatio,
      seed: seedOf(generation.id) + shot.attempts + 1000,
      continuityUrl: await signedFrameUrl(shot.image_path!),
      continuityKind: "end",
    });
    await admin
      .from("generation_shots")
      .update({
        end_image_prediction_id: predictionId,
        end_image_attempts: shot.end_image_attempts + 1,
      })
      .eq("id", shot.id)
      .eq("stage", "end_image");
  } catch (e) {
    console.error("startEndImage", errorMessage(e));
    // Le plan s'animera sans image de fin.
    await admin
      .from("generation_shots")
      .update({ stage: "framed" })
      .eq("id", shot.id)
      .eq("stage", "end_image")
      .is("end_image_prediction_id", null);
  }
}

// Image ratée : un nouvel essai automatique par demande, sinon le plan est
// marqué en échec et l'utilisateur peut le régénérer.
async function imageRetryOrFail(shot: Shot) {
  const retry = shot.attempts % 2 === 1 && shot.attempts < MAX_IMAGE_ATTEMPTS;
  const update = createAdminClient()
    .from("generation_shots")
    .update({ stage: retry ? "queued" : "failed", image_prediction_id: null })
    .eq("id", shot.id)
    .eq("stage", "image");
  await (shot.image_prediction_id
    ? update.eq("image_prediction_id", shot.image_prediction_id)
    : update.is("image_prediction_id", null));
}

async function advanceFrames(
  generation: VideoGeneration,
  shots: Shot[],
  getPrediction: (id: string) => Promise<PredictionState>,
) {
  const admin = createAdminClient();

  await Promise.all(
    shots.map(async (shot) => {
      if (shot.stage !== "image" || !shot.image_prediction_id) return;
      const prediction = await getPrediction(shot.image_prediction_id);
      if (!isTerminal(prediction.status)) return;
      const imageUrl = outputUrlOf(prediction);
      if (prediction.status !== "succeeded" || !imageUrl) {
        return imageRetryOrFail(shot);
      }

      let imagePath: string;
      try {
        imagePath = await copyOutputToStorage(imageUrl, framePath(generation, shot));
      } catch (e) {
        // Sortie expirée (URL Replicate valable une heure) ou illisible.
        console.error("advanceFrames: copie", errorMessage(e));
        return imageRetryOrFail(shot);
      }
      // Avec image de fin, le plan repasse par l'étape 'end_image'.
      const needsEnd = generation.preset.endFrames && Boolean(shot.end_image_prompt);
      await admin
        .from("generation_shots")
        .update({ stage: needsEnd ? "end_image" : "framed", image_path: imagePath })
        .eq("id", shot.id)
        .eq("stage", "image")
        .eq("image_prediction_id", shot.image_prediction_id);
      if (shot.position === 0) {
        await admin
          .from("generations")
          .update({ poster_path: imagePath })
          .eq("id", generation.id);
      }
      if (needsEnd) await startEndImage(generation, { ...shot, image_path: imagePath });
    }),
  );

  await Promise.all(
    shots.map(async (shot) => {
      if (shot.stage !== "end_image") return;
      // Image de fin manquante (relance perdue) : on la relance.
      if (!shot.end_image_prediction_id) return startEndImage(generation, shot);
      const prediction = await getPrediction(shot.end_image_prediction_id);
      if (!isTerminal(prediction.status)) return;
      const endUrl = prediction.status === "succeeded" ? outputUrlOf(prediction) : null;

      let endPath: string | null = null;
      if (endUrl) {
        try {
          endPath = await copyOutputToStorage(endUrl, `${framePath(generation, shot)}-end`);
        } catch (e) {
          console.error("advanceFrames: copie de l'image de fin", errorMessage(e));
        }
      }
      // Le filtre de contenu du modèle d'image refuse parfois une requête
      // sans raison stable : un deuxième essai suffit souvent.
      if (!endPath && shot.end_image_attempts < MAX_END_IMAGE_ATTEMPTS) {
        const { data: retried } = await admin
          .from("generation_shots")
          .update({ end_image_prediction_id: null })
          .eq("id", shot.id)
          .eq("stage", "end_image")
          .eq("end_image_prediction_id", shot.end_image_prediction_id)
          .select("id");
        if (retried?.length) await startEndImage(generation, shot);
        return;
      }
      // Sans image de fin, le plan s'anime à partir de sa seule image de
      // départ : le mouvement est moins ample, mais la vidéo continue.
      if (!endPath) console.error("advanceFrames: image de fin abandonnée", shot.id);
      await admin
        .from("generation_shots")
        .update({ stage: "framed", end_image_path: endPath })
        .eq("id", shot.id)
        .eq("stage", "end_image")
        .eq("end_image_prediction_id", shot.end_image_prediction_id);
    }),
  );

  const fresh = await loadShots(generation.id);
  await startQueuedShots(generation, fresh);

  // Toutes les images sont prêtes : l'animation enchaîne sans validation.
  if (fresh.every((s) => s.stage === "framed" && s.image_path)) {
    const { data: claimed } = await createAdminClient()
      .from("generations")
      .update({ stage: "shots" })
      .eq("id", generation.id)
      .eq("stage", "frames")
      .eq("status", "processing")
      .select("id");
    if (claimed?.length) await advanceAnimation(generation, await loadShots(generation.id), getPrediction);
  }
}

// Abandon avant l'animation : les crédits sont rendus.
export async function cancelFrames(
  generationId: string,
  userId: string,
): Promise<{ error?: string }> {
  const loaded = await loadGeneration(generationId);
  if (!loaded || loaded.row.user_id !== userId) return { error: "Vidéo introuvable." };
  if (loaded.row.status !== "processing") {
    return { error: "Cette vidéo n'est plus en cours." };
  }
  if (loaded.row.stage !== "frames") {
    return { error: "L'animation a déjà commencé." };
  }
  await createAdminClient().rpc("fail_generation", { p_generation_id: generationId });
  return {};
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

async function advanceAnimation(
  generation: VideoGeneration,
  shots: Shot[],
  getPrediction: (id: string) => Promise<PredictionState>,
) {
  const admin = createAdminClient();

  await Promise.all(
    shots.map(async (shot) => {
      if (shot.stage !== "video" || !shot.video_prediction_id) return;
      const prediction = await getPrediction(shot.video_prediction_id);
      if (!isTerminal(prediction.status)) return;
      const clipUrl = outputUrlOf(prediction);
      if (prediction.status !== "succeeded" || !clipUrl) {
        return videoRetryOrFail(shot);
      }

      let clipPath: string;
      try {
        clipPath = await copyOutputToStorage(
          clipUrl,
          `${generation.user_id}/${generation.id}/shot-${String(shot.position).padStart(3, "0")}`,
        );
      } catch (e) {
        // Sortie expirée (URL Replicate valable une heure) ou illisible.
        console.error("advanceAnimation: copie", errorMessage(e));
        return videoRetryOrFail(shot);
      }
      await admin
        .from("generation_shots")
        .update({ stage: "done", clip_path: clipPath })
        .eq("id", shot.id)
        .eq("video_prediction_id", shot.video_prediction_id);
    }),
  );

  const fresh = await loadShots(generation.id);
  if (fresh.some((s) => s.stage === "failed")) {
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    return;
  }
  if (fresh.every((s) => s.stage === "done" && s.clip_path)) {
    await assemble(generation, fresh.map((s) => s.clip_path!));
    return;
  }

  if (!generation.twinId || isDirectPreset(generation.preset)) {
    return startDirectShots(generation, fresh);
  }

  for (const shot of fresh) {
    if (shot.stage !== "framed") continue;
    if ((await startAnimation(generation, shot)) === "throttled") return;
  }
}

async function startAnimation(
  generation: VideoGeneration,
  shot: Shot,
): Promise<"ok" | "throttled"> {
  const admin = createAdminClient();
  const videoAttempts = shot.video_attempts + 1;

  // Verrou : un seul appelant lance l'animation de ce plan.
  const { data: claimed } = await admin
    .from("generation_shots")
    .update({ stage: "video", video_attempts: videoAttempts, video_prediction_id: null })
    .eq("id", shot.id)
    .eq("stage", "framed")
    .select("id");
  if (!claimed?.length) return "ok";

  try {
    const imageUrl = await signedFrameUrl(shot.image_path!);
    const endImageUrl = shot.end_image_path
      ? await signedFrameUrl(shot.end_image_path)
      : undefined;
    const videoPredictionId = await startShotVideo({
      endImageUrl,
      videoModel: generation.preset.videoModel,
      aspectRatio: generation.aspectRatio,
      imageUrl,
      prompt: `${shot.motion_prompt} The main character keeps exactly the same face, hair and outfit as in the image. Real footage: handheld camera with slight natural shake, lifelike speed and weight of movement, no slow motion, no cinematic camera work.`,
      negativePrompt: NEGATIVE_PROMPT,
      durationSeconds: shot.duration_seconds,
    });
    await admin
      .from("generation_shots")
      .update({ video_prediction_id: videoPredictionId })
      .eq("id", shot.id);
    return "ok";
  } catch (e) {
    if (isOutOfCredit(e)) return failOutOfCredit(generation.id, e);
    if (isRateLimited(e)) {
      await admin
        .from("generation_shots")
        .update({ stage: "framed", video_attempts: shot.video_attempts })
        .eq("id", shot.id)
        .eq("stage", "video")
        .is("video_prediction_id", null);
      return "throttled";
    }
    console.error("startAnimation", errorMessage(e));
    await videoRetryOrFail({
      ...shot,
      stage: "video",
      video_attempts: videoAttempts,
      video_prediction_id: null,
    });
    return "ok";
  }
}

// Animation ratée : l'image validée est réanimée, dans la limite de
// MAX_VIDEO_ATTEMPTS. La condition sur la prédiction évite qu'un appelant en
// retard remette en attente un plan déjà relancé.
async function videoRetryOrFail(shot: Shot) {
  const update = createAdminClient()
    .from("generation_shots")
    .update({
      stage:
        shot.video_attempts >= MAX_VIDEO_ATTEMPTS
          ? "failed"
          : shot.image_path
            ? "framed"
            : "queued",
      video_prediction_id: null,
    })
    .eq("id", shot.id)
    .eq("stage", "video");
  await (shot.video_prediction_id
    ? update.eq("video_prediction_id", shot.video_prediction_id)
    : update.is("video_prediction_id", null));
}

// ---------------------------------------------------------------------------
// Pilotage
// ---------------------------------------------------------------------------

async function loadGeneration(generationId: string) {
  const { data: row } = await createAdminClient()
    .from("generations")
    .select(
      "id, user_id, twin_id, stage, status, metadata, storyboard, twins(replicate_model_version)",
    )
    .eq("id", generationId)
    .eq("kind", "video")
    .maybeSingle();
  if (!row) return null;
  const metadata = row.metadata as {
    aspect_ratio?: string;
    preset?: string;
    pace?: string;
    sora_character_id?: string;
    character_name?: string;
  } | null;
  const generation: VideoGeneration = {
    id: row.id,
    user_id: row.user_id,
    twinId: row.twin_id,
    twinModelVersion: row.twins?.replicate_model_version ?? "",
    aspectRatio: isAspectRatio(metadata?.aspect_ratio) ? metadata.aspect_ratio : "9:16",
    preset: findPreset(metadata?.preset) ?? PRESETS[0],
    imageEngine: imageEngineOf(row.metadata),
    pace: isPace(metadata?.pace) ? metadata.pace : DEFAULT_PACE,
    soraCharacterId: metadata?.sora_character_id ?? null,
    characterName: metadata?.character_name ?? null,
  };
  return { row, generation };
}

async function loadShots(generationId: string): Promise<Shot[]> {
  const { data, error } = await createAdminClient()
    .from("generation_shots")
    .select("*")
    .eq("generation_id", generationId)
    .order("position");
  if (error) throw error;
  return data;
}

// Retrouve la génération d'une prédiction de plan (pour le webhook).
export async function findShotGenerationId(predictionId: string) {
  const { data } = await createAdminClient()
    .from("generation_shots")
    .select("generation_id")
    .or(`image_prediction_id.eq.${predictionId},video_prediction_id.eq.${predictionId}`)
    .maybeSingle();
  return data?.generation_id ?? null;
}

// Fait avancer une vidéo d'une étape. `known` évite de redemander une
// prédiction déjà reçue (webhook).
export async function advanceVideoGeneration(
  generationId: string,
  known?: PredictionState,
) {
  const loaded = await loadGeneration(generationId);
  if (!loaded || loaded.row.status !== "processing") return;

  const get = (id: string) =>
    known?.id === id ? Promise.resolve(known) : getPrediction(id);
  const shots = await loadShots(generationId);

  if (loaded.row.stage === "frames") {
    await advanceFrames(loaded.generation, shots, get);
  } else if (loaded.row.stage === "shots") {
    await advanceAnimation(loaded.generation, shots, get);
  }
}

async function assemble(generation: VideoGeneration, clipPaths: string[]) {
  const admin = createAdminClient();

  // Verrou : un seul appelant fait le montage.
  const { data: claimed } = await admin
    .from("generations")
    .update({ stage: "assembling" })
    .eq("id", generation.id)
    .eq("stage", "shots")
    .eq("status", "processing")
    .select("id");
  if (!claimed?.length) return;

  try {
    // Un seul plan : pas de montage, le clip est la vidéo finale.
    const storagePath =
      clipPaths.length === 1
        ? clipPaths[0]
        : await concatenateClips(generation, clipPaths);

    await admin
      .from("generations")
      .update({ status: "completed", storage_path: storagePath })
      .eq("id", generation.id);
  } catch (e) {
    console.error("assemble", errorMessage(e));
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
  }
}

async function concatenateClips(generation: VideoGeneration, clipPaths: string[]) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  const bucket = createAdminClient().storage.from(GENERATIONS_BUCKET);
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-"));

  try {
    const files = await Promise.all(
      clipPaths.map(async (clipPath, i) => {
        const { data, error } = await bucket.download(clipPath);
        if (error) throw error;
        const file = path.join(dir, `${String(i).padStart(3, "0")}.mp4`);
        await writeFile(file, Buffer.from(await data.arrayBuffer()));
        return file;
      }),
    );
    const output = path.join(dir, "output.mp4");

    // Réencodage systématique : les clips sortent des modèles vidéo à ~20 Mo
    // les 5 s, et leur simple concaténation dépasse la taille maximale d'un
    // fichier dans Storage. Le débit est plafonné pour que la vidéo finale
    // tienne sous MAX_VIDEO_MB quelle que soit sa durée.
    const kept = keptSeconds(generation.preset.id, generation.pace);
    const seconds = clipPaths.length * kept;
    const maxKbps = Math.min(8000, Math.floor((MAX_VIDEO_MB * 8192) / seconds));
    // Chaque clip est coupé à la durée gardée (rythme rapide) puis enchaîné.
    // Le son suit quand le modèle en génère (Sora).
    const audio = hasAudio(generation.preset.videoModel);
    const filter =
      files
        .map(
          (_, i) =>
            `[${i}:v]trim=0:${kept},setpts=PTS-STARTPTS[v${i}];` +
            (audio ? `[${i}:a]atrim=0:${kept},asetpts=PTS-STARTPTS[a${i}];` : ""),
        )
        .join("") +
      files.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("") +
      `concat=n=${files.length}:v=1:a=${audio ? 1 : 0}[outv]${audio ? "[outa]" : ""}`;

    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        ...files.flatMap((file) => ["-i", file]),
        "-filter_complex", filter,
        "-map", "[outv]",
        ...(audio ? ["-map", "[outa]", "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-maxrate", `${maxKbps}k`, "-bufsize", `${maxKbps * 2}k`,
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );

    const storagePath = `${generation.user_id}/${generation.id}.mp4`;
    const { error } = await bucket.upload(storagePath, await readFile(output), {
      contentType: "video/mp4",
      upsert: true,
    });
    if (error) throw error;
    return storagePath;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
