"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

type Mode = "signin" | "signup";

export function AuthForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-[0_0_40px_-12px_var(--neon-purple)]">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-md py-2 font-medium transition-colors ${
              mode === m ? "bg-neon-purple text-white" : "text-muted hover:text-text"
            }`}
          >
            {m === "signin" ? "Connexion" : "Inscription"}
          </button>
        ))}
      </div>
      {/* key : réinitialise l'état du formulaire quand on change d'onglet */}
      <CredentialsForm
        key={mode}
        mode={mode}
        next={next}
        initialError={mode === "signin" ? initialError : undefined}
      />
    </div>
  );
}

function CredentialsForm({
  mode,
  next,
  initialError,
}: {
  mode: Mode;
  next?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    mode === "signin" ? signIn : signUp,
    { error: initialError },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-lg border border-white/10 bg-bg px-3 py-2.5 outline-none focus:border-neon-purple"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Mot de passe</span>
        <input
          type="password"
          name="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="rounded-lg border border-white/10 bg-bg px-3 py-2.5 outline-none focus:border-neon-purple"
        />
      </label>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.error && <span className="text-neon-pink">{state.error}</span>}
        {state.message && <span className="text-neon-cyan">{state.message}</span>}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink py-2.5 font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {pending
          ? "Un instant…"
          : mode === "signin"
            ? "Se connecter"
            : "Créer mon compte"}
      </button>
    </form>
  );
}
