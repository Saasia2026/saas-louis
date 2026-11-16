"use server";

import { createSeedreamImage, falEnabled, uploadToFal } from "@/lib/fal";
import { SWAP_INPUTS_BUCKET } from "@/lib/generation";
import {
  findPreset,
  influencerCredits,
  influencerPrompt,
  isInfluencerGender,
  isInfluencerKind,
  INFLUENCER_DESCRIPTION_MAX,
} from "@/lib/influencer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InfluencerResult =
  | { ok: true; id: string; path: string; url: string; credits: number }
  | { ok: false; error: "auth" | "invalid" | "credits" | "refused" | "failed" | "unavailable"; need?: number };

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

// Crée un influenceur : crédits débités, image générée, rangée dans le
// stockage du studio. En cas d'échec, les crédits sont rendus.
export async function createInfluencer(input: {
  kind: unknown;
  gender: unknown;
  description?: unknown;
  photoPath?: unknown;
  preset?: unknown;
}): Promise<InfluencerResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "auth" };
  if (!falEnabled()) return { ok: false, error: "unavailable" };
  // Exemple choisi : il décrit tout le personnage, type compris.
  const preset = input.preset ? findPreset(input.preset) : undefined;
  if (input.preset && !preset) return { ok: false, error: "invalid" };
  const kind = preset?.kind ?? input.kind;
  if (!isInfluencerKind(kind) || !isInfluencerGender(input.gender)) return { ok: false, error: "invalid" };
  const description =
    typeof input.description === "string" ? input.description.trim().slice(0, INFLUENCER_DESCRIPTION_MAX) : "";
  // Photo de départ : seulement un fichier du dossier de l'utilisateur.
  const photoPath =
    typeof input.photoPath === "string" && input.photoPath.startsWith(`${userId}/`) && !input.photoPath.includes("..")
      ? input.photoPath
      : null;
  const fromPhoto = Boolean(photoPath);
  const cost = influencerCredits(fromPhoto);

  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("start_influencer", {
    p_user_id: userId,
    p_kind: kind,
    p_gender: input.gender,
    p_description: preset ? `[${preset.id}] ${description}`.trim() : description,
    p_from_photo: fromPhoto,
    p_credits: cost,
  });
  if (error || !id) {
    if (error?.message.includes("insufficient_credits")) {
      const { data: profile } = await admin.from("profiles").select("credits_remaining").eq("id", userId).single();
      return { ok: false, error: "credits", need: Math.max(1, cost - (profile?.credits_remaining ?? 0)) };
    }
    console.error("createInfluencer", error?.message);
    return { ok: false, error: "failed" };
  }

  try {
    // La photo passe par le stockage de fal, qui ne lit pas toujours les
    // URLs signées de Supabase.
    let imageUrl: string | undefined;
    if (photoPath) {
      const { data: photo } = await admin.storage.from(SWAP_INPUTS_BUCKET).download(photoPath);
      if (!photo) throw new Error("photo introuvable");
      imageUrl = await uploadToFal(await photo.arrayBuffer(), photo.type || "image/jpeg");
    }

    const prompt = influencerPrompt({ kind, gender: input.gender, description, fromPhoto, preset });
    const result = await createSeedreamImage({ prompt, imageUrl });
    if (!("url" in result) || !result.url) {
      await admin.rpc("fail_influencer", { p_id: id });
      return { ok: false, error: result.refused ? "refused" : "failed" };
    }

    const res = await fetch(result.url);
    if (!res.ok) throw new Error(`téléchargement ${res.status}`);
    const path = `${userId}/influencer-${id}.jpg`;
    const { error: uploadError } = await admin.storage
      .from(SWAP_INPUTS_BUCKET)
      .upload(path, await res.arrayBuffer(), { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await admin.from("influencers").update({ status: "ready", image_path: path }).eq("id", id);
    const { data: signed } = await admin.storage.from(SWAP_INPUTS_BUCKET).createSignedUrl(path, 60 * 60);
    const { data: profile } = await admin.from("profiles").select("credits_remaining").eq("id", userId).single();
    return { ok: true, id, path, url: signed?.signedUrl ?? "", credits: profile?.credits_remaining ?? 0 };
  } catch (e) {
    console.error("createInfluencer", e instanceof Error ? e.message : e);
    await admin.rpc("fail_influencer", { p_id: id });
    return { ok: false, error: "failed" };
  }
}

// Supprime un influenceur et son image.
export async function deleteInfluencer(id: unknown) {
  const userId = await currentUserId();
  if (!userId || typeof id !== "string") return false;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("influencers")
    .select("image_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return false;
  if (row.image_path) await admin.storage.from(SWAP_INPUTS_BUCKET).remove([row.image_path]);
  await admin.from("influencers").delete().eq("id", id);
  return true;
}
