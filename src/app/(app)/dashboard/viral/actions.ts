"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Nouvelle conversation : le fil précédent est masqué (il compte encore dans
// la limite du jour).
export async function clearChat() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return;
  await createAdminClient().from("viral_messages").update({ hidden: true }).eq("user_id", auth.claims.sub);
  revalidatePath("/dashboard/viral");
}
