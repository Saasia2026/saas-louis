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

// Origine publique du site, pour les liens envoyés par email.
async function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? (await headers()).get("origin") ?? ""
  );
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
    if (error.code === "invalid_credentials" || error.status === 400) {
      return { error: t.errors.wrong };
    }
    // Panne du service d'authentification (quota dépassé, indisponibilité).
    // Ne pas laisser croire à un mauvais mot de passe : on cherche alors
    // pendant des heures un problème qui n'existe pas.
    return { error: t.errors.unavailable };
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

  const origin = await appOrigin();
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

// Connexion par compte Google. Supabase renvoie l'URL de consentement ;
// Google revient ensuite sur /auth/confirm avec un ?code= que la route
// échange contre une session. Vaut aussi pour une première inscription.
export async function signInWithGoogle(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const next = safeNextPath(formData.get("next"));
  const origin = await appOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) {
    return { error: (await getDictionary()).login.errors.googleFailed };
  }

  redirect(data.url);
}

// Envoie le lien de réinitialisation. La réponse est volontairement la même
// que le compte existe ou non : sinon la page dirait qui est inscrit.
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const t = (await getDictionary()).login;
  if (!email) {
    return { error: t.errors.missingEmail };
  }

  const origin = await appOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/auth/password`,
  });
  // Seule une panne d'envoi est signalée ; un email inconnu ne l'est pas.
  if (error && error.code !== "user_not_found") {
    return { error: t.errors.resetFailed };
  }

  return { message: t.resetSent };
}

// Nouveau mot de passe, une fois la session ouverte par le lien reçu.
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const t = (await getDictionary()).password;

  if (!password || !confirmation) {
    return { error: t.errors.missing };
  }
  if (password !== confirmation) {
    return { error: t.errors.mismatch };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: fmt(t.errors.tooShort, { min: MIN_PASSWORD_LENGTH }) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") {
      return { error: t.errors.weak };
    }
    return { error: t.errors.failed };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
