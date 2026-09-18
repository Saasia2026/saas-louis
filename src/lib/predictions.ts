import "server-only";
import { GENERATIONS_BUCKET } from "@/lib/generation";
import { createAdminClient } from "@/lib/supabase/admin";

// Refus passager (429) de fal : on réessaie plus tard.
export function isRateLimited(e: unknown) {
  return statusOf(e) === 429;
}

// Compte fal bloqué : solde épuisé (403, ou 402). Comme un 429, ce n'est pas
// la faute de la demande : l'utilisateur voit un message clair.
export function isOutOfCredit(e: unknown) {
  const status = statusOf(e);
  return status === 402 || status === 403;
}

function statusOf(e: unknown) {
  const error = e as { response?: Response; status?: unknown } | null;
  return error?.response?.status ?? error?.status;
}

// Les erreurs des SDK peuvent embarquer la requête, clé comprise : on ne
// journalise que le message. Les erreurs Supabase sont des objets simples
// ({ message, code, details }).
export function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  const error = e as { message?: unknown; code?: unknown; details?: unknown } | null;
  if (typeof error?.message === "string") {
    return [error.code, error.message, error.details].filter(Boolean).join(" · ");
  }
  return String(e);
}

export type PredictionStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

// Ce qu'on lit d'une requête fal (voir getFalPrediction).
export type PredictionState = {
  id: string;
  status: PredictionStatus;
  output: unknown;
  // Refus du filtre de contenu : relancer le même prompt ne sert à rien.
  refused?: boolean;
};

// Message enregistré en base (traduit à l'affichage, voir generate/actions.ts).
export const CONTENT_REFUSED_ERROR =
  "Le filtre de contenu du modèle vidéo a refusé une scène. Tes crédits ont été rendus.";

// Erreur fal 422 « content_policy_violation » (filtre de contenu).
export function isContentRefused(e: unknown) {
  const body = (e as { body?: { detail?: unknown } } | null)?.body;
  return (
    Array.isArray(body?.detail) &&
    body.detail.some((d: { type?: unknown }) => d?.type === "content_policy_violation")
  );
}

const TERMINAL: PredictionStatus[] = ["succeeded", "failed", "canceled"];

const OUTPUT_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
};

export function isTerminal(status: PredictionStatus) {
  return TERMINAL.includes(status);
}

// Première URL de sortie d'une prédiction (tableau ou URL seule).
export function outputUrlOf(prediction: PredictionState): string | null {
  const output: unknown = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  return typeof output === "string" ? output : null;
}

// Copie une sortie fal dans Supabase Storage et renvoie son chemin.
export async function copyOutputToStorage(
  outputUrl: string,
  basePath: string,
  bucket = GENERATIONS_BUCKET,
) {
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error(`Téléchargement de la sortie : ${response.status}`);
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

// Applique l'état final d'une génération en une seule requête (photo, ou
// remplacement de personnage) : copie le résultat ou rembourse les crédits.
// Idempotent : ne touche qu'une génération encore en cours.
export async function applyImagePredictionResult(prediction: PredictionState) {
  if (!isTerminal(prediction.status)) return;

  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, user_id")
    .in("kind", ["image", "swap"])
    .eq("replicate_prediction_id", prediction.id)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  if (!generation) return;

  const outputUrl = outputUrlOf(prediction);
  if (prediction.status !== "succeeded" || !outputUrl) {
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    if (prediction.refused) {
      await admin
        .from("generations")
        .update({ error: CONTENT_REFUSED_ERROR })
        .eq("id", generation.id);
    }
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
