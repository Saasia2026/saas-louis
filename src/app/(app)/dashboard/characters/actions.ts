"use server";

import { revalidatePath } from "next/cache";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { CHARACTER_VIDEOS_BUCKET, MAX_CHARACTER_NAME_LENGTH } from "@/lib/character";
import { registerCharacter } from "@/lib/characters";
import { errorMessage } from "@/lib/predictions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

// Enregistre la vidéo déjà déposée dans Storage, puis crée le personnage
// chez Sora. La ligne passe de 'pending' à 'ready' ou 'failed'.
export async function createCharacter(input: {
  name: string;
  videoPath: string;
}): Promise<Result<{ characterId: string }>> {
  const t = await getDictionary();
  const errors = t.characters.errors;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: t.common.sessionExpired };

  const name = input.name.trim();
  if (!name) return { error: errors.noName };
  if (name.length > MAX_CHARACTER_NAME_LENGTH) {
    return { error: fmt(t.common.maxChars, { max: MAX_CHARACTER_NAME_LENGTH }) };
  }
  // La vidéo doit appartenir au dossier de l'utilisateur.
  if (!input.videoPath.startsWith(`${auth.claims.sub}/`)) {
    return { error: errors.invalidVideo };
  }

  const { data: character, error } = await supabase
    .from("characters")
    .insert({ user_id: auth.claims.sub, name, video_path: input.videoPath })
    .select("id")
    .single();
  if (error) {
    console.error("createCharacter", error.message);
    return { error: errors.createFailed };
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
  const t = await getDictionary();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: t.common.sessionExpired };

  const { data: character } = await supabase
    .from("characters")
    .select("video_path")
    .eq("id", characterId)
    .maybeSingle();
  if (!character) return { error: t.characters.errors.notFound };

  const { error } = await supabase.from("characters").delete().eq("id", characterId);
  if (error) return { error: t.characters.errors.deleteFailed };
  await createAdminClient()
    .storage.from(CHARACTER_VIDEOS_BUCKET)
    .remove([character.video_path]);

  revalidatePath("/dashboard/characters");
  return { data: null };
}
