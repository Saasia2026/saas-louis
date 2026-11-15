"use server";

import type { Json } from "@/lib/supabase/database.types";
import { parseAnswers } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Fin du tunnel d'accueil : les réponses sont gardées et le tunnel ne
// revient plus. Sans réponses valides (« Plus tard » avant la fin), il est
// seulement marqué comme vu.
export async function finishOnboarding(answers: unknown) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return;
  const parsed = parseAnswers(answers);
  const { error } = await createAdminClient()
    .from("profiles")
    .update({
      onboarded_at: new Date().toISOString(),
      ...(parsed ? { onboarding: parsed as unknown as Json } : {}),
    })
    .eq("id", auth.claims.sub);
  if (error) console.error("finishOnboarding", error.message);
}
