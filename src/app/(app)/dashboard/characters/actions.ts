"use server";

import { revalidatePath } from "next/cache";
import { CHARACTER_VIDEOS_BUCKET, MAX_CHARACTER_NAME_LENGTH } from "@/lib/character";
import { registerCharacter } from "@/lib/characters";
import { errorMessage } from "@/lib/replicate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

// Enregistre la vidéo déjà déposée dans Storage, puis crée le personnage
// chez Sora. La ligne passe de 'pending' à 'ready' ou 'failed'.
export async function createCharacter(input: {
  name: string;
  videoPath: string;
}): Promise<Result<{ characterId: string }>> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: "Session expirée, reconnecte-toi." };

  const name = input.name.trim();
  if (!name) return { error: "Donne un nom à ton personnage." };
  if (name.length > MAX_CHARACTER_NAME_LENGTH) {
    return { error: `${MAX_CHARACTER_NAME_LENGTH} caractères maximum.` };
  }
  // La vidéo doit appartenir au dossier de l'utilisateur.
  if (!input.videoPath.startsWith(`${auth.claims.sub}/`)) {
    return { error: "Vidéo invalide." };
  }

  const { data: character, error } = await supabase
    .from("characters")
    .insert({ user_id: auth.claims.sub, name, video_path: input.videoPath })
    .select("id")
    .single();
  if (error) {
    console.error("createCharacter", error.message);
    return { error: "Le personnage n'a pas pu être créé." };
  }

  try {
    await registerCharacter(character.id);
  } catch (e) {
    console.error("createCharacter: Sora", errorMessage(e));
  }
  revalidatePath("/dashboard/characters");
  return { data: { characterId: character.id } };
}

export async function deleteCharacter(characterId: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: "Session expirée, reconnecte-toi." };

  const { data: character } = await supabase
    .from("characters")
    .select("video_path")
    .eq("id", characterId)
    .maybeSingle();
  if (!character) return { error: "Personnage introuvable." };

  const { error } = await supabase.from("characters").delete().eq("id", characterId);
  if (error) return { error: "La suppression a échoué." };
  await createAdminClient()
    .storage.from(CHARACTER_VIDEOS_BUCKET)
    .remove([character.video_path]);

  revalidatePath("/dashboard/characters");
  return { data: null };
}
