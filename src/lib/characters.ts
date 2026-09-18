import "server-only";
import { CHARACTER_VIDEOS_BUCKET } from "@/lib/character";
import { createFalCharacter } from "@/lib/fal";
import { errorMessage } from "@/lib/replicate";
import { createAdminClient } from "@/lib/supabase/admin";

// Personnage Sora : une vidéo courte envoyée une fois donne un identifiant
// réutilisé dans chaque plan, pour que le sujet reste le même d'une vidéo à
// l'autre (voir createFalCharacter).

const VIDEO_URL_TTL_SECONDS = 60 * 60;

export type Character = {
  id: string;
  name: string;
  status: string;
  sora_character_id: string | null;
  error: string | null;
};

// Envoie la vidéo à Sora et note l'identifiant obtenu. Le personnage reste
// en 'pending' tant que Sora n'a pas répondu.
export async function registerCharacter(characterId: string) {
  const admin = createAdminClient();
  const { data: character, error } = await admin
    .from("characters")
    .select("id, name, video_path, status")
    .eq("id", characterId)
    .single();
  if (error) throw error;
  if (character.status !== "pending") return;

  try {
    const { data: signed, error: signError } = await admin.storage
      .from(CHARACTER_VIDEOS_BUCKET)
      .createSignedUrl(character.video_path, VIDEO_URL_TTL_SECONDS);
    if (signError) throw signError;

    const soraCharacterId = await createFalCharacter({
      name: character.name,
      videoUrl: signed.signedUrl,
    });
    await admin
      .from("characters")
      .update({ sora_character_id: soraCharacterId, status: "ready" })
      .eq("id", characterId)
      .eq("status", "pending");
  } catch (e) {
    console.error("registerCharacter", errorMessage(e));
    await admin
      .from("characters")
      .update({
        status: "failed",
        error: "La création du personnage a échoué. Réessaie avec une autre vidéo.",
      })
      .eq("id", characterId)
      .eq("status", "pending");
  }
}

// Identifiant Sora d'un personnage prêt, pour l'utilisateur donné.
export async function soraCharacterId(characterId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("characters")
    .select("sora_character_id")
    .eq("id", characterId)
    .eq("user_id", userId)
    .eq("status", "ready")
    .maybeSingle();
  return data?.sora_character_id ?? null;
}
