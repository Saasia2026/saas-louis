import { validateWebhook, type Prediction } from "replicate";
import { applyImagePredictionResult, getWebhookSigningSecret } from "@/lib/replicate";
import { advanceTwinModel, findModelTwinId } from "@/lib/twin-model";
import { advanceVideoGeneration, findShotGenerationId } from "@/lib/video-pipeline";

// Le montage d'une vidéo longue peut se déclencher ici.
export const maxDuration = 300;

// Appelé par Replicate quand une prédiction (photo, image/animation d'un
// plan vidéo, ou étape du modèle 3D d'un jumeau) se termine.
export async function POST(request: Request) {
  const secret = await getWebhookSigningSecret();
  if (!secret) {
    console.error("Webhook Replicate : secret de signature indisponible");
    return new Response("Webhook not configured", { status: 500 });
  }

  const valid = await validateWebhook(request.clone(), secret).catch(() => false);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const prediction = (await request.json()) as Prediction;
  const [videoGenerationId, modelTwinId] = await Promise.all([
    findShotGenerationId(prediction.id),
    findModelTwinId(prediction.id),
  ]);
  if (videoGenerationId) {
    await advanceVideoGeneration(videoGenerationId, prediction);
  } else if (modelTwinId) {
    await advanceTwinModel(modelTwinId, prediction);
  } else {
    await applyImagePredictionResult(prediction);
  }

  return new Response(null, { status: 204 });
}
