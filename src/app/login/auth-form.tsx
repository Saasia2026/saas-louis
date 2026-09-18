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
    <div className="panel animate-fade-up p-6 [animation-delay:150ms]">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-lg py-2 font-medium transition-colors ${
              mode === m ? "bg-surface-3 text-text shadow-sm" : "text-muted hover:text-text"
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
      <label className="flex flex-col gap-2">
        <span className="label">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="field"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="label">Mot de passe</span>
        <input
          type="password"
          name="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="field"
        />
      </label>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.message && <span className="text-success">{state.message}</span>}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
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
