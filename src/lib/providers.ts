import "server-only";
import {
  createFalDirectVideo,
  createFalTextVideo,
  createFalReferenceImage,
  createFalShotVideo,
  createFalTwinImage,
  falEnabled,
  getFalPrediction,
  isFalId,
  type ContinuityKind,
} from "@/lib/fal";
import {
  findVideoModel,
  type AspectRatio,
  type Preset,
  type VideoModelId,
} from "@/lib/generation";
import {
  createReplicate,
  createShotVideoPrediction,
  createTwinImagePrediction,
  errorMessage,
  twinImagePrompt,
  type PredictionState,
} from "@/lib/replicate";

// Choix du fournisseur de génération. Replicate passe en premier
// (GENERATION_PROVIDER=fal inverse l'ordre) ; si le premier refuse la
// demande (saturation, solde épuisé…) et que FAL_KEY est défini, l'autre
// prend le relais. Si les deux échouent, l'erreur du premier remonte : un 429
// laisse le plan en attente jusqu'au passage suivant.
async function withFallback(
  label: string,
  replicate: () => Promise<string>,
  fal: () => Promise<string>,
) {
  if (!falEnabled()) return replicate();
  const [first, second] =
    process.env.GENERATION_PROVIDER === "fal" ? [fal, replicate] : [replicate, fal];
  try {
    return await first();
  } catch (e) {
    console.error(`${label}: bascule`, errorMessage(e));
    try {
      return await second();
    } catch (fallbackError) {
      console.error(`${label}: relais`, errorMessage(fallbackError));
      throw e;
    }
  }
}

// Moteur d'image d'une génération, choisi à son lancement et gardé dans ses
// métadonnées : "reference" (photos du jumeau en référence, via fal) dès que
// FAL_KEY est défini, sinon "lora" (Flux + LoRA). IMAGE_ENGINE=lora force
// l'ancien moteur.
export type ImageEngine = "reference" | "lora";

export function currentImageEngine(): ImageEngine {
  return falEnabled() && process.env.IMAGE_ENGINE !== "lora" ? "reference" : "lora";
}

export function imageEngineOf(metadata: unknown): ImageEngine {
  return (metadata as { image_engine?: unknown } | null)?.image_engine === "reference"
    ? "reference"
    : "lora";
}

// Prompt d'image d'une scène, au format du moteur. `scene` désigne le jumeau
// par "the creator" (storyboard) ou est la demande brute (photo seule).
export function imagePrompt(
  engine: ImageEngine,
  input: { appearance: string; outfit?: string; scene: string },
) {
  if (engine === "lora") return twinImagePrompt(input);
  const outfit = input.outfit ? `The main character wears ${input.outfit}. ` : "";
  return outfit + input.scene.replace(/\bthe creator\b/gi, "the main character");
}

// Lance une image du jumeau. Renvoie l'identifiant de prédiction à suivre.
// Pas de bascule entre moteurs : une vidéo mêlant les deux perdrait sa
// cohérence. Un échec du moteur à références est traité comme une image
// ratée (ou remis en attente si c'est un 429).
export async function startTwinImage(input: {
  engine: ImageEngine;
  preset: Preset;
  twinId: string;
  modelVersion: string;
  prompt: string;
  aspectRatio: AspectRatio;
  seed?: number;
  continuityUrl?: string;
  continuityKind?: ContinuityKind;
}) {
  if (input.engine === "reference") {
    return createFalReferenceImage({
      ...input,
      imageModel: input.preset.imageModel,
      resolution: input.preset.resolution,
    });
  }
  return withFallback(
    "startTwinImage",
    async () => (await createTwinImagePrediction(input)).id,
    () => createFalTwinImage(input),
  );
}

// Lance l'animation d'un plan. Renvoie l'identifiant de prédiction à suivre.
// Seul Kling 2.5 existe des deux côtés ; les autres modèles passent par fal.
export function startShotVideo(input: {
  videoModel: VideoModelId;
  aspectRatio: AspectRatio;
  imageUrl: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  endImageUrl?: string;
}) {
  if (findVideoModel(input.videoModel)?.falOnly) return createFalShotVideo(input);
  return withFallback(
    "startShotVideo",
    async () => (await createShotVideoPrediction(input)).id,
    () => createFalShotVideo(input),
  );
}

// Lance un plan sans image de départ : le modèle reçoit les photos du jumeau
// et la scène (préréglages en vidéo directe).
export function startDirectShotVideo(input: {
  videoModel: VideoModelId;
  twinId: string;
  aspectRatio: AspectRatio;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  seed?: number;
}) {
  return createFalDirectVideo(input);
}

// Lance un plan sans jumeau ni image : le modèle ne reçoit que la scène.
export function startTextShotVideo(input: {
  videoModel: VideoModelId;
  aspectRatio: AspectRatio;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  seed?: number;
  soraCharacterId?: string;
}) {
  return createFalTextVideo(input);
}

export function getPrediction(id: string): Promise<PredictionState> {
  return isFalId(id) ? getFalPrediction(id) : createReplicate().predictions.get(id);
}
