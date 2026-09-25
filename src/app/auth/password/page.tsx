import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/app/language-switcher";
import { LogoMark } from "@/app/logo-mark";
import { ThemeToggle } from "@/app/theme-toggle";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.password} — TwinPost` };
}

// Cible du lien de réinitialisation : /auth/confirm a déjà ouvert la session.
// Sans session, le lien est expiré ou déjà utilisé.
export default async function NewPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login?error=lien_invalide");
  }

  const t = await getDictionary();

  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <LogoMark className="size-16" />
        </div>
        <h1 className="text-gradient mt-8 animate-fade-up text-center text-3xl font-semibold tracking-tight [animation-delay:80ms]">
          {t.password.title}
        </h1>
        <p className="mt-2 mb-8 animate-fade-up text-center text-sm text-muted [animation-delay:120ms]">
          {fmt(t.password.intro, { min: 8 })}
        </p>
        <PasswordForm />
      </div>
    </main>
  );
}
