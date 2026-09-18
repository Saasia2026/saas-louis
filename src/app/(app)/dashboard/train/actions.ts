"use server";

import { zipSync } from "fflate";
import { redirect } from "next/navigation";
import {
  TRAINER,
  TRAINING_INPUT,
  createReplicate,
  errorMessage,
  getReplicateOwner,
  pickSupportedInputs,
  publicWebhookUrl,
  twinModelName,
} from "@/lib/replicate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MIN_PHOTOS, TRAINING_PHOTOS_BUCKET } from "@/lib/twin";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

// Renvoie le jumeau en attente de l'utilisateur, ou en crée un.
// Appelée juste avant le premier upload, pour ne pas créer de jumeau vide.
export async function ensurePendingTwin(): Promise<Result<{ twinId: string }>> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  const { data: existing } = await supabase
    .from("twins")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { data: { twinId: existing.id } };
  }

  const { count } = await supabase
    .from("twins")
    .select("id", { count: "exact", head: true });
  const { data: created, error } = await supabase
    .from("twins")
    .insert({ name: `Jumeau ${(count ?? 0) + 1}` })
    .select("id")
    .single();
  if (error) {
    return { error: "Impossible de créer ton jumeau. Réessaie." };
  }
  return { data: { twinId: created.id } };
}

// Zippe les photos, les envoie à Replicate et lance le fine-tuning LoRA.
export async function startTraining(
  twinId: string,
  consentConfirmed: boolean,
): Promise<Result<null>> {
  if (consentConfirmed !== true) {
    return { error: "Confirme que les photos sont bien de toi." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  // Lecture via la session : la RLS garantit que le jumeau et les photos
  // appartiennent bien à l'utilisateur.
  const { data: photos } = await supabase
    .from("training_photos")
    .select("storage_path")
    .eq("twin_id", twinId);
  if (!photos || photos.length < MIN_PHOTOS) {
    return { error: `Il faut au moins ${MIN_PHOTOS} photos.` };
  }

  const admin = createAdminClient();

  // Verrou : un seul lancement possible, même en cas de double clic.
  const { data: locked } = await admin
    .from("twins")
    .update({
      status: "training",
      training_started_at: new Date().toISOString(),
      consent_confirmed_at: new Date().toISOString(),
    })
    .eq("id", twinId)
    .eq("user_id", auth.claims.sub)
    .eq("status", "pending")
    .select("id");
  if (!locked?.length) {
    return { error: "Ce jumeau est déjà en entraînement." };
  }

  try {
    const files: Record<string, Uint8Array> = {};
    await Promise.all(
      photos.map(async ({ storage_path }, i) => {
        const { data, error } = await admin.storage
          .from(TRAINING_PHOTOS_BUCKET)
          .download(storage_path);
        if (error) throw error;
        const ext = storage_path.split(".").pop();
        files[`photo-${String(i + 1).padStart(2, "0")}.${ext}`] = new Uint8Array(
          await data.arrayBuffer(),
        );
      }),
    );
    // Les images sont déjà compressées : on les stocke sans recompresser.
    const zip = zipSync(files, { level: 0 });

    const replicate = createReplicate();
    const owner = await getReplicateOwner(replicate);
    const modelName = twinModelName(twinId);

    const [upload, trainer] = await Promise.all([
      replicate.files.create(
        new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
        { filename: `${twinId}.zip` },
      ),
      replicate.models.get(TRAINER.owner, TRAINER.name),
    ]);
    if (!trainer.latest_version) {
      throw new Error("Version du trainer introuvable");
    }

    // Le modèle existe déjà si un premier lancement a échoué après sa création.
    const exists = await replicate.models
      .get(owner, modelName)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await replicate.models.create(owner, modelName, {
        visibility: "private",
        hardware: "gpu-t4",
        description: "Jumeau TwinPost",
      });
    }

    const webhook = publicWebhookUrl("/api/twins/train/webhook");
    const training = await replicate.trainings.create(
      TRAINER.owner,
      TRAINER.name,
      trainer.latest_version.id,
      {
        destination: `${owner}/${modelName}`,
        input: {
          ...pickSupportedInputs(trainer.latest_version.openapi_schema, TRAINING_INPUT),
          input_images: upload.urls.get,
        },
        ...(webhook && { webhook, webhook_events_filter: ["completed"] }),
      },
    );

    await admin
      .from("twins")
      .update({ replicate_training_id: training.id })
      .eq("id", twinId);
  } catch (e) {
    console.error("startTraining", errorMessage(e));
    // On rend la main à l'utilisateur pour qu'il puisse relancer.
    await admin
      .from("twins")
      .update({ status: "pending", training_started_at: null })
      .eq("id", twinId);
    return { error: "Le lancement a échoué. Réessaie dans un instant." };
  }

  redirect(`/dashboard/twins/${twinId}`);
}
