"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/login/actions";
import { useI18n } from "@/i18n/provider";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    updatePassword,
    {},
  );
  const { t } = useI18n();

  return (
    <div className="panel glass animate-fade-up p-6 shadow-[0_30px_80px_-30px_rgb(91_124_255/0.45)] [animation-delay:150ms]">
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="label">{t.password.newPassword}</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label">{t.password.confirm}</span>
          <input
            type="password"
            name="confirmation"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
          />
        </label>

        <p aria-live="polite" className="min-h-5 text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
        </p>

        <button type="submit" disabled={pending} className="btn btn-accent w-full">
          {pending ? t.password.wait : t.password.submit}
        </button>
      </form>
    </div>
  );
}
