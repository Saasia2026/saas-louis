import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { normalizeRefCode, REF_COOKIE, refCookieOptions } from "./referral-code";
import type { Database } from "./supabase/database.types";

export async function rememberRefCode(value: unknown) {
  const code = normalizeRefCode(value);
  if (!code) return;
  (await cookies()).set(REF_COOKIE, code, refCookieOptions);
}

export async function readRefCode() {
  return normalizeRefCode((await cookies()).get(REF_COOKIE)?.value);
}

// À appeler une fois la session ouverte. La fonction SQL ne rattache que les
// comptes de moins d'un jour sans parrain, avec un code qui existe.
export async function claimRefCode(supabase: SupabaseClient<Database>) {
  const code = await readRefCode();
  if (!code) return;
  const { error } = await supabase.rpc("claim_referral", { p_code: code });
  if (!error) (await cookies()).delete(REF_COOKIE);
}
