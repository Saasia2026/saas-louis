"use server";

import { revalidatePath } from "next/cache";
import { GENERATIONS_BUCKET, SWAP_INPUTS_BUCKET } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";

export async function deleteGeneration(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return;

  const { data: gen } = await supabase
    .from("generations")
    .select("id, storage_path, user_id")
    .eq("id", id)
    .single();

  if (!gen || gen.user_id !== auth.claims.sub) return;

  if (gen.storage_path) {
    await supabase.storage.from(GENERATIONS_BUCKET).remove([gen.storage_path]);
  }
  // Passage découpé pour ce rendu (voir startSwap), s'il y en a un.
  await supabase.storage.from(SWAP_INPUTS_BUCKET).remove([`${gen.user_id}/cuts/${gen.id}.mp4`]);

  await supabase.from("generations").delete().eq("id", id);
  revalidatePath("/dashboard/videos");
  revalidatePath("/dashboard/generate");
}
