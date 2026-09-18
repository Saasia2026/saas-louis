import "server-only";
import type { Prediction } from "replicate";
import { getTwinAppearance } from "@/lib/appearance";
import {
  copyOutputToStorage,
  createReplicate,
  createTwinImagePrediction,
  errorMessage,
  isRateLimited,
  isTerminal,
  outputUrlOf,
  publicWebhookUrl,
  twinImagePrompt,
} from "@/lib/replicate";
import { createAdminClient } from "@/lib/supabase/admin";
import { TWIN_MODELS_BUCKET } from "@/lib/twin";

// Modèle 3D d'un jumeau prêt : une photo en pied du jumeau (stage 'image'),
// convertie en maillage texturé par Hunyuan 3D (stage 'mesh'). Comme pour les
// vidéos, chaque transition est protégée par un update conditionnel :
// webhook et polling peuvent faire avancer le même jumeau en même temps.

const MODEL_3D = "tencent/hunyuan-3d-3.1";
// Assez de détails pour un visage, sous la limite d'upload de Storage.
const MODEL_3D_FACES = 150_000;
const MAX_ATTEMPTS = 2;

const AVATAR_SCENE =
  "Full-body studio photo of the creator standing upright and facing the camera, arms relaxed slightly away from the body, neutral expression, simple fitted casual clothes and sneakers, plain light grey seamless background, soft even lighting, the whole body in frame from head to feet, nothing else in the picture.";

type Twin = {
  id: string;
  user_id: string;
  replicate_model_version: string;
  model_status: string | null;
  model_prediction_id: string | null;
  model_attempts: number;
};

// Retrouve le jumeau d'une prédiction de modèle 3D (pour le webhook).
export async function findModelTwinId(predictionId: string) {
  const { data } = await createAdminClient()
    .from("twins")
    .select("id")
    .eq("model_prediction_id", predictionId)
    .maybeSingle();
  return data?.id ?? null;
}

// Lance ou fait avancer le modèle 3D d'un jumeau d'une étape.
export async function advanceTwinModel(twinId: string, known?: Prediction) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("twins")
    .select(
      "id, user_id, status, consent_confirmed_at, replicate_model_version, model_status, model_prediction_id, model_attempts",
    )
    .eq("id", twinId)
    .maybeSingle();
  if (
    !row?.replicate_model_version ||
    row.status !== "ready" ||
    !row.consent_confirmed_at ||
    row.model_status === "ready" ||
    row.model_status === "failed"
  ) {
    return;
  }
  const twin: Twin = { ...row, replicate_model_version: row.replicate_model_version };

  if (!twin.model_status) return startAvatarImage(twin);
  // Lancement en cours chez un autre appelant.
  if (!twin.model_prediction_id) return;

  const replicate = createReplicate();
  const prediction =
    known?.id === twin.model_prediction_id
      ? known
      : await replicate.predictions.get(twin.model_prediction_id);
  if (!isTerminal(prediction.status)) return;
  const outputUrl = outputUrlOf(prediction);
  if (prediction.status !== "succeeded" || !outputUrl) return retryOrFail(twin);

  if (twin.model_status === "image") {
    // Verrou : un seul appelant lance la modélisation.
    const { data: claimed } = await admin
      .from("twins")
      .update({ model_status: "mesh", model_prediction_id: null })
      .eq("id", twin.id)
      .eq("model_status", "image")
      .eq("model_prediction_id", twin.model_prediction_id)
      .select("id");
    if (!claimed?.length) return;

    try {
      const imagePath = await copyOutputToStorage(
        outputUrl,
        `${twin.user_id}/${twin.id}/avatar`,
        TWIN_MODELS_BUCKET,
      );
      const webhook = publicWebhookUrl("/api/generate/webhook");
      const mesh = await replicate.predictions.create({
        model: MODEL_3D,
        input: { image: outputUrl, face_count: MODEL_3D_FACES, generate_type: "Normal" },
        ...(webhook && { webhook, webhook_events_filter: ["completed"] }),
      });
      await admin
        .from("twins")
        .update({ model_image_path: imagePath, model_prediction_id: mesh.id })
        .eq("id", twin.id);
    } catch (e) {
      if (isRateLimited(e)) {
        // L'image reste valable une heure : nouvel essai au passage suivant.
        await admin
          .from("twins")
          .update({ model_status: "image", model_prediction_id: twin.model_prediction_id })
          .eq("id", twin.id)
          .eq("model_status", "mesh")
          .is("model_prediction_id", null);
        return;
      }
      console.error("advanceTwinModel: modélisation", errorMessage(e));
      await retryOrFail({ ...twin, model_status: "mesh", model_prediction_id: null });
    }
    return;
  }

  // Stage 'mesh' terminé : on garde le fichier 3D.
  const modelPath = await copyOutputToStorage(
    outputUrl,
    `${twin.user_id}/${twin.id}/model`,
    TWIN_MODELS_BUCKET,
  );
  await admin
    .from("twins")
    .update({ model_status: "ready", model_path: modelPath })
    .eq("id", twin.id)
    .eq("model_status", "mesh")
    .eq("model_prediction_id", prediction.id);
}

async function startAvatarImage(twin: Twin) {
  const admin = createAdminClient();
  if (twin.model_attempts >= MAX_ATTEMPTS) {
    await admin.from("twins").update({ model_status: "failed" }).eq("id", twin.id);
    return;
  }

  // Verrou : un seul appelant lance la photo de référence.
  const { data: claimed } = await admin
    .from("twins")
    .update({ model_status: "image", model_attempts: twin.model_attempts + 1 })
    .eq("id", twin.id)
    .is("model_status", null)
    .select("id");
  if (!claimed?.length) return;

  try {
    const prediction = await createTwinImagePrediction({
      modelVersion: twin.replicate_model_version,
      prompt: twinImagePrompt({
        appearance: await getTwinAppearance(twin.id),
        scene: AVATAR_SCENE,
      }),
      aspectRatio: "2:3",
    });
    await admin
      .from("twins")
      .update({ model_prediction_id: prediction.id })
      .eq("id", twin.id);
  } catch (e) {
    const throttled = isRateLimited(e);
    if (!throttled) console.error("startAvatarImage", errorMessage(e));
    // Un refus passager ne compte pas comme un essai.
    await admin
      .from("twins")
      .update({
        model_status: null,
        model_attempts: throttled ? twin.model_attempts : twin.model_attempts + 1,
      })
      .eq("id", twin.id);
  }
}

// Un échec repart de la photo de référence, dans la limite de MAX_ATTEMPTS.
async function retryOrFail(twin: Twin) {
  const update = createAdminClient()
    .from("twins")
    .update({
      model_status: twin.model_attempts < MAX_ATTEMPTS ? null : "failed",
      model_prediction_id: null,
    })
    .eq("id", twin.id)
    .eq("model_status", twin.model_status!);
  await (twin.model_prediction_id
    ? update.eq("model_prediction_id", twin.model_prediction_id)
    : update.is("model_prediction_id", null));
}
