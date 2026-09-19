"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Supprime une discussion du Director (la RLS limite à ses propres lignes).
export async function deleteConversation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("director_conversations").delete().eq("id", id);
  if (error) console.error("deleteConversation", error.message);
  revalidatePath("/dashboard", "layout");
}
