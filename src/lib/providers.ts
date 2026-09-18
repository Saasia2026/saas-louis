import "server-only";
import {
  createFalDirectVideo,
  createFalTextVideo,
  createFalReferenceImage,
  createFalShotVideo,
  getFalPrediction,
  isFalId,
  type ContinuityKind,
} from "@/lib/fal";
import type { AspectRatio, Preset, VideoModelId } from "@/lib/generation";
import type { PredictionState } from "@/lib/predictions";

// Toute la génération passe par fal : images du jumeau à partir de ses
// photos de référence, puis plans vidéo.

// Prompt d'image d'une scène. `scene` désigne le jumeau par "the creator"
// (storyboard) ou est la demande brute (photo seule).
export function imagePrompt(input: { outfit?: string; scene: string }) {
  const outfit = input.outfit ? `The main character wears ${input.outfit}. ` : "";
  return outfit + input.scene.replace(/\bthe creator\b/gi, "the main character");
}

// Lance une image du jumeau. Renvoie l'identifiant de prédiction à suivre.
export function startTwinImage(input: {
  preset: Preset;
  twinId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  seed?: number;
  continuityUrl?: string;
  continuityKind?: ContinuityKind;
}) {
  return createFalReferenceImage({
    ...input,
    imageModel: input.preset.imageModel,
    resolution: input.preset.resolution,
  });
}

// Lance l'animation d'un plan à partir de son image.
export function startShotVideo(input: {
  videoModel: VideoModelId;
  aspectRatio: AspectRatio;
  imageUrl: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  endImageUrl?: string;
}) {
  return createFalShotVideo(input);
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
  referenceVideoUrl?: string;
}) {
  return createFalTextVideo(input);
}

// Les anciennes prédictions Replicate ne sont plus suivies : échec, et la
// génération rembourse ses crédits.
export async function getPrediction(id: string): Promise<PredictionState> {
  return isFalId(id) ? getFalPrediction(id) : { id, status: "failed", output: null };
}
