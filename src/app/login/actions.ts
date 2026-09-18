"use server";

import { headers } from "next/headers";
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
  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirme ton email avant de te connecter." };
    }
    return { error: "Email ou mot de passe incorrect." };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    };
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
      return { error: "Mot de passe trop faible." };
    }
    return { error: "Inscription impossible. Réessaie dans un instant." };
  }

  // Confirmation d'email désactivée côté Supabase : la session existe déjà.
  if (data.session) {
    redirect("/dashboard");
  }

  return {
    message: "Compte créé ! Clique sur le lien reçu par email pour l'activer.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
