import "server-only";
import Replicate, { type Prediction, type Status, type Training } from "replicate";
import { GENERATIONS_BUCKET, VIDEO_MODEL } from "@/lib/generation";
import { createAdminClient } from "@/lib/supabase/admin";

export const TRAINER = { owner: "ostris", name: "flux-dev-lora-trainer" } as const;
export const TRIGGER_WORD = "TWNPST";

// Paramètres de la spec. Seuls ceux que la version courante du trainer
// déclare dans son schéma sont envoyés (voir pickSupportedInputs).
export const TRAINING_INPUT = {
  trigger_word: TRIGGER_WORD,
  steps: 1000,
  lora_rank: 16,
  optimizer: "adamw8bit",
  batch_size: 1,
  resolution: "512,768,1024",
  autocaption: true,
  // Chaque légende commence par le mot-clé : le visage s'y rattache.
  autocaption_prefix: `a photo of ${TRIGGER_WORD}, `,
  learning_rate: 0.0004,
};

// Refus passager (429) de Replicate ou de fal : la création de prédictions
// est limitée, sur Replicate fortement quand le compte a moins de 5 $ de
// crédit. On réessaie plus tard.
export function isRateLimited(e: unknown) {
  return statusOf(e) === 429;
}

// Compte fournisseur bloqué : solde épuisé (fal répond 403, Replicate 402).
// Comme un 429, ce n'est pas la faute de la demande : le plan repart en
// attente, et l'utilisateur voit un message clair.
export function isOutOfCredit(e: unknown) {
  const status = statusOf(e);
  return status === 402 || status === 403;
}

function statusOf(e: unknown) {
  const error = e as { response?: Response; status?: unknown } | null;
  return error?.response?.status ?? error?.status;
}

// Les erreurs du SDK Replicate embarquent la requête, jeton compris :
// on ne journalise que le message.
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function createReplicate() {
  const auth = process.env.REPLICATE_API_TOKEN;
  if (!auth) throw new Error("REPLICATE_API_TOKEN manquant");
  return new Replicate({ auth });
}

export async function getReplicateOwner(replicate: Replicate) {
  return process.env.REPLICATE_USERNAME ?? (await replicate.accounts.current()).username;
}

export function twinModelName(twinId: string) {
  return `twinpost-${twinId}`;
}

// Replicate ne peut pas joindre localhost : sans URL publique en https,
// on ne déclare pas de webhook et le dashboard interroge Replicate à la place.
export function publicWebhookUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base?.startsWith("https://")) return undefined;
  return new URL(path, base).toString();
}

export function pickSupportedInputs(
  schema: unknown,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const properties = (
    schema as {
      components?: { schemas?: { TrainingInput?: { properties?: object } } };
    } | null
  )?.components?.schemas?.TrainingInput?.properties;
  if (!properties) return input;
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key in properties),
  );
}

export async function getWebhookSigningSecret() {
  if (process.env.REPLICATE_WEBHOOK_SIGNING_SECRET) {
    return process.env.REPLICATE_WEBHOOK_SIGNING_SECRET;
  }
  try {
    return (await createReplicate().webhooks.default.secret.get()).key;
  } catch {
    return null;
  }
}

const TERMINAL: Status[] = ["succeeded", "failed", "canceled"];

// Applique l'état final d'un entraînement au jumeau correspondant.
// Idempotent : ne touche qu'un jumeau encore en "training".
export async function applyTrainingResult(training: Training) {
  if (!TERMINAL.includes(training.status)) return;

  const admin = createAdminClient();
  const succeeded = training.status === "succeeded" && training.output?.version;

  const { error } = await admin
    .from("twins")
    .update(
      succeeded
        ? {
            status: "ready",
            replicate_model_version: training.output!.version!,
            training_completed_at: new Date().toISOString(),
          }
        : { status: "failed", training_completed_at: new Date().toISOString() },
    )
    .eq("replicate_training_id", training.id)
    .eq("status", "training");

  if (error) throw error;
}

const OUTPUT_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
  glb: "model/gltf-binary",
};

// Ce qu'on lit d'une prédiction, Replicate ou fal (voir getFalPrediction).
export type PredictionState = Pick<Prediction, "id" | "status" | "output">;

// "owner/model:version" → "version"
export function versionIdOf(modelVersion: string) {
  return modelVersion.split(":").pop()!;
}

export function isTerminal(status: Status) {
  return TERMINAL.includes(status);
}

// Première URL de sortie d'une prédiction (tableau ou URL seule).
export function outputUrlOf(prediction: PredictionState): string | null {
  const output: unknown = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  return typeof output === "string" ? output : null;
}

// Prompt d'image du jumeau : le mot-clé appris, avec son apparence réelle
// (voir getTwinAppearance) pour que la scène ne la contredise pas.
// Dans une scène de storyboard, le jumeau est décrit là où il agit ("the
// creator") : placé en tête, il fige la pose façon photo d'entraînement et
// son visage déborde sur les autres personnages.
export function twinImagePrompt(input: {
  appearance: string;
  outfit?: string;
  scene: string;
}) {
  const details = [input.appearance, input.outfit && `wearing ${input.outfit}`]
    .filter(Boolean)
    .join(", ");
  const person = details ? `${TRIGGER_WORD} (${details})` : TRIGGER_WORD;
  let placed = false;
  const scene = input.scene.replace(/\bthe creator\b/gi, () => {
    if (placed) return TRIGGER_WORD;
    placed = true;
    return person;
  });
  return placed ? scene : `A photo of ${person}. ${scene}`;
}

// Lance une image du jumeau (Flux + LoRA). `prompt` vient de twinImagePrompt.
export async function createTwinImagePrediction(input: {
  modelVersion: string;
  prompt: string;
  aspectRatio: string;
  seed?: number;
}) {
  const webhook = publicWebhookUrl("/api/generate/webhook");
  return createReplicate().predictions.create({
    version: versionIdOf(input.modelVersion),
    input: {
      prompt: input.prompt,
      ...(input.seed !== undefined && { seed: input.seed }),
      aspect_ratio: input.aspectRatio,
      num_outputs: 1,
      // Flux dev : 2 à 3,5 donne les images les plus réalistes.
      guidance_scale: 3,
      num_inference_steps: 28,
      output_format: "webp",
      output_quality: 90,
    },
    ...(webhook && { webhook, webhook_events_filter: ["completed"] }),
  });
}

// Anime l'image d'un plan vidéo (Kling).
export async function createShotVideoPrediction(input: {
  imageUrl: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
}) {
  const webhook = publicWebhookUrl("/api/generate/webhook");
  return createReplicate().predictions.create({
    model: VIDEO_MODEL,
    input: {
      start_image: input.imageUrl,
      prompt: input.prompt,
      duration: input.durationSeconds,
      negative_prompt: input.negativePrompt,
    },
    ...(webhook && { webhook, webhook_events_filter: ["completed"] }),
  });
}

// Copie une sortie Replicate ou fal dans Supabase Storage (les URLs Replicate
// expirent au bout d'une heure) et renvoie son chemin.
export async function copyOutputToStorage(
  outputUrl: string,
  basePath: string,
  bucket = GENERATIONS_BUCKET,
) {
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error(`Téléchargement de la sortie : ${response.status}`);
  // replicate.delivery répond en application/octet-stream : le type vient
  // de l'extension du fichier.
  // fal renvoie parfois des URLs sans extension : on se fie alors à l'en-tête.
  const urlExt = new URL(outputUrl).pathname.split(".").pop()?.toLowerCase() ?? "";
  const headerType = response.headers.get("content-type")?.split(";")[0].trim();
  const ext = OUTPUT_TYPES[urlExt]
    ? urlExt
    : (Object.keys(OUTPUT_TYPES).find((k) => OUTPUT_TYPES[k] === headerType) ?? urlExt);
  if (!OUTPUT_TYPES[ext]) throw new Error(`Format de sortie inattendu : ${ext}`);
  const storagePath = `${basePath}.${ext}`;

  const { error } = await createAdminClient()
    .storage.from(bucket)
    .upload(storagePath, await response.arrayBuffer(), {
      contentType: OUTPUT_TYPES[ext],
      upsert: true,
    });
  if (error) throw error;
  return storagePath;
}

// Applique l'état final d'une prédiction de photo : copie l'image ou
// rembourse le crédit. Idempotent : ne touche qu'une photo encore en cours.
export async function applyImagePredictionResult(prediction: PredictionState) {
  if (!isTerminal(prediction.status)) return;

  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, user_id")
    .eq("kind", "image")
    .eq("replicate_prediction_id", prediction.id)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  if (!generation) return;

  const outputUrl = outputUrlOf(prediction);
  if (prediction.status !== "succeeded" || !outputUrl) {
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    return;
  }

  const storagePath = await copyOutputToStorage(
    outputUrl,
    `${generation.user_id}/${generation.id}`,
  );
  const { error } = await admin
    .from("generations")
    .update({ status: "completed", storage_path: storagePath })
    .eq("id", generation.id)
    .in("status", ["pending", "processing"]);
  if (error) throw error;
}
