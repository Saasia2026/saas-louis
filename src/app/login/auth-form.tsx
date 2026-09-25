"use client";

import { useActionState, useState } from "react";
import { useI18n } from "@/i18n/provider";
import {
  requestPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  type AuthState,
} from "./actions";

type Mode = "signin" | "signup";

export function AuthForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [forgot, setForgot] = useState(false);
  const { t } = useI18n();

  return (
    <div className="panel glass animate-fade-up p-6 shadow-[0_30px_80px_-30px_rgb(91_124_255/0.45)] [animation-delay:150ms]">
      {forgot ? (
        <ForgotForm onBack={() => setForgot(false)} />
      ) : (
        <>
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
                {m === "signin" ? t.login.signIn : t.login.signUp}
              </button>
            ))}
          </div>
          <GoogleButton next={next} />
          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            {t.login.or}
            <span className="h-px flex-1 bg-line" />
          </div>
          {/* key : réinitialise l'état du formulaire quand on change d'onglet */}
          <CredentialsForm
            key={mode}
            mode={mode}
            next={next}
            initialError={mode === "signin" ? initialError : undefined}
            onForgot={() => setForgot(true)}
          />
        </>
      )}
    </div>
  );
}

function GoogleButton({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    {},
  );
  const { t } = useI18n();

  return (
    <form action={formAction}>
      {next && <input type="hidden" name="next" value={next} />}
      <button type="submit" disabled={pending} className="btn btn-secondary w-full">
        <GoogleMark />
        {pending ? t.login.wait : t.login.google}
      </button>
      {state.error && (
        <p aria-live="polite" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

// Logo Google, aux couleurs officielles : elles ne suivent pas le thème.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {},
  );
  const { t } = useI18n();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">{t.login.forgotTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.login.forgotIntro}</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="label">{t.login.email}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="field"
        />
      </label>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.message && <span className="text-success">{state.message}</span>}
      </p>

      <button type="submit" disabled={pending} className="btn btn-accent w-full">
        {pending ? t.login.wait : t.login.submitReset}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="text-center text-sm text-muted transition-colors hover:text-text"
      >
        {t.login.backToSignIn}
      </button>
    </form>
  );
}

function CredentialsForm({
  mode,
  next,
  initialError,
  onForgot,
}: {
  mode: Mode;
  next?: string;
  initialError?: string;
  onForgot: () => void;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    mode === "signin" ? signIn : signUp,
    { error: initialError },
  );
  const { t } = useI18n();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-2">
        <span className="label">{t.login.email}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="field"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="label">{t.login.password}</span>
        <input
          type="password"
          name="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="field"
        />
      </label>
      {mode === "signin" && (
        <button
          type="button"
          onClick={onForgot}
          className="-mt-2 self-start text-sm text-muted transition-colors hover:text-text"
        >
          {t.login.forgot}
        </button>
      )}

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.message && <span className="text-success">{state.message}</span>}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-accent w-full"
      >
        {pending
          ? t.login.wait
          : mode === "signin"
            ? t.login.submitSignIn
            : t.login.submitSignUp}
      </button>
    </form>
  );
}
