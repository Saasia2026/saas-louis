"use server";

import { headers } from "next/headers";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";

export type AuthState = { error?: string; message?: string };

const MIN_PASSWORD_LENGTH = 8;

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const t = (await getDictionary()).login;
  if (!email || !password) {
    return { error: t.errors.missing };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: t.errors.notConfirmed };
    }
    return { error: t.errors.wrong };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const t = (await getDictionary()).login;
  if (!email || !password) {
    return { error: t.errors.missing };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: fmt(t.errors.tooShort, { min: MIN_PASSWORD_LENGTH }) };
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/dashboard` },
  });
  if (error) {
    if (error.code === "weak_password") {
      return { error: t.errors.weak };
    }
    return { error: t.errors.signUpFailed };
  }

  // Confirmation d'email désactivée côté Supabase : la session existe déjà.
  if (data.session) {
    redirect("/dashboard");
  }

  return { message: t.created };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
