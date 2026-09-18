"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_TWIN_NAME_LENGTH,
  TRAINING_PHOTOS_BUCKET,
  TWIN_MODELS_BUCKET,
} from "@/lib/twin";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

// Jumeau de l'utilisateur connecté (la RLS filtre les autres).
async function ownTwin(twinId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const { data: twin } = await supabase
    .from("twins")
    .select("id, user_id")
    .eq("id", twinId)
    .maybeSingle();
  return twin ? { supabase, twin } : null;
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

// Supprime un jumeau : photos et anciens fichiers 3D effacés. Les photos et
// vidéos déjà générées sont gardées.
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
