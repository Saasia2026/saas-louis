"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createReplicate,
  errorMessage,
  getReplicateOwner,
  twinModelName,
} from "@/lib/replicate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_TWIN_NAME_LENGTH,
  TRAINING_PHOTOS_BUCKET,
  TWIN_MODELS_BUCKET,
  type TwinModelStatus,
  type TwinModelView,
} from "@/lib/twin";
import { advanceTwinModel } from "@/lib/twin-model";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Jumeau de l'utilisateur connecté (la RLS filtre les autres).
async function ownTwin(twinId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const { data: twin } = await supabase
    .from("twins")
    .select("id, user_id, status, replicate_training_id")
    .eq("id", twinId)
    .maybeSingle();
  return twin ? { supabase, twin } : null;
}

// État du modèle 3D. Sans webhook joignable (dev local), c'est aussi ici
// que la modélisation avance.
export async function getTwinModel(twinId: string): Promise<Result<TwinModelView>> {
  const owned = await ownTwin(twinId);
  if (!owned) return { error: "Jumeau introuvable." };

  try {
    await advanceTwinModel(twinId);
  } catch (e) {
    console.error("getTwinModel", errorMessage(e));
  }

  const { data: twin } = await owned.supabase
    .from("twins")
    .select("model_status, model_path, model_image_path")
    .eq("id", twinId)
    .single();
  if (!twin) return { error: "Jumeau introuvable." };

  const view: TwinModelView = { status: twin.model_status as TwinModelStatus };
  const bucket = owned.supabase.storage.from(TWIN_MODELS_BUCKET);
  const [image, model] = await Promise.all([
    twin.model_image_path
      ? bucket.createSignedUrl(twin.model_image_path, SIGNED_URL_TTL_SECONDS)
      : null,
    twin.model_status === "ready" && twin.model_path
      ? bucket.createSignedUrl(twin.model_path, SIGNED_URL_TTL_SECONDS)
      : null,
  ]);
  view.imageUrl = image?.data?.signedUrl;
  view.modelUrl = model?.data?.signedUrl;
  return { data: view };
}

// Relance la modélisation 3D depuis la photo de référence.
export async function regenerateTwinModel(twinId: string): Promise<Result<null>> {
  const owned = await ownTwin(twinId);
  if (!owned) return { error: "Jumeau introuvable." };
  const { error } = await createAdminClient()
    .from("twins")
    .update({ model_status: null, model_prediction_id: null, model_attempts: 0 })
    .eq("id", twinId)
    .in("model_status", ["ready", "failed"]);
  if (error) return { error: "Relance impossible. Réessaie." };
  return { data: null };
}

export async function renameTwin(twinId: string, name: string): Promise<Result<null>> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Donne un nom à ton jumeau." };
  if (trimmed.length > MAX_TWIN_NAME_LENGTH) {
    return { error: `${MAX_TWIN_NAME_LENGTH} caractères maximum.` };
  }
  const owned = await ownTwin(twinId);
  if (!owned) return { error: "Jumeau introuvable." };
  const { error } = await owned.supabase
    .from("twins")
    .update({ name: trimmed })
    .eq("id", twinId);
  if (error) return { error: "Renommage impossible. Réessaie." };
  revalidatePath("/dashboard", "layout");
  return { data: null };
}

// Supprime un jumeau : entraînement annulé, photos et fichiers 3D effacés,
// modèle Replicate supprimé. Les photos et vidéos déjà générées sont gardées.
export async function deleteTwin(twinId: string): Promise<Result<null>> {
  const owned = await ownTwin(twinId);
  if (!owned) return { error: "Jumeau introuvable." };
  const { twin } = owned;
  const admin = createAdminClient();

  const { error } = await admin
    .from("twins")
    .delete()
    .eq("id", twin.id)
    .eq("user_id", twin.user_id);
  if (error) return { error: "Suppression impossible. Réessaie." };

  // Le jumeau n'existe plus pour l'utilisateur : le nettoyage externe est
  // fait au mieux, un échec ne doit pas le faire réapparaître.
  await Promise.all([
    removeFolder(TRAINING_PHOTOS_BUCKET, `${twin.user_id}/${twin.id}`),
    removeFolder(TWIN_MODELS_BUCKET, `${twin.user_id}/${twin.id}`),
    deleteReplicateModel(twin),
  ]);

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

async function removeFolder(bucketId: string, folder: string) {
  const bucket = createAdminClient().storage.from(bucketId);
  const { data: files, error } = await bucket.list(folder, { limit: 1000 });
  if (error) {
    console.error("deleteTwin: liste", bucketId, error.message);
    return;
  }
  if (!files.length) return;
  const { error: removeError } = await bucket.remove(
    files.map((f) => `${folder}/${f.name}`),
  );
  if (removeError) console.error("deleteTwin: suppression", bucketId, removeError.message);
}

async function deleteReplicateModel(twin: {
  id: string;
  status: string;
  replicate_training_id: string | null;
}) {
  try {
    const replicate = createReplicate();
    if (twin.status === "training" && twin.replicate_training_id) {
      await replicate.trainings.cancel(twin.replicate_training_id);
    }
    if (!twin.replicate_training_id) return;

    // Un modèle ne peut être supprimé qu'une fois vide de versions.
    const owner = await getReplicateOwner(replicate);
    const name = twinModelName(twin.id);
    const route = `/models/${owner}/${name}`;
    const { results: versions } = await replicate.models.versions.list(owner, name);
    for (const version of versions) {
      await replicate.request(`${route}/versions/${version.id}`, { method: "DELETE" });
    }
    await replicate.request(route, { method: "DELETE" });
  } catch (e) {
    console.error("deleteTwin: modèle Replicate", errorMessage(e));
  }
}
