import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackdropVideo } from "@/app/backdrop-video";
import { LanguageSwitcher } from "@/app/language-switcher";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.password} — TwinPost` };
}

// Cible du lien de réinitialisation : /auth/confirm a déjà ouvert la session.
// Sans session, le lien est expiré ou déjà utilisé. Même mise en page que la
// connexion : vidéo plein cadre, accroche à gauche, carte en verre à droite.
export default async function NewPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login?error=lien_invalide");
  }

  const t = await getDictionary();
  const L = t.landing;

  return (
    <main className="video-page relative isolate flex min-h-dvh flex-1 flex-col">
      <BackdropVideo h="/demos/demo-21" v="/examples/gallery/g-105" />
      <header className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:px-12" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <Link href="/" className="font-wide text-[0.95rem] tracking-wide uppercase">
          TwinPost
        </Link>
        <LanguageSwitcher />
      </header>

      <div
        className="grid w-full flex-1 items-end gap-10 px-5 pt-10 sm:px-8 lg:grid-cols-12 lg:items-center lg:px-12 lg:pb-16"
        style={{ paddingBottom: "max(1.75rem, calc(1rem + env(safe-area-inset-bottom)))" }}
      >
        <div className="hidden animate-fade-up lg:col-span-7 lg:block">
          <p className="eyebrow">{L.eyebrow}</p>
          <p className="mt-5 font-headline text-7xl leading-[0.94] xl:text-8xl">
            <span className="block">{L.titleTop}</span>
            <span className="text-shine block">{L.titleBottom}</span>
          </p>
        </div>

        <div className="w-full sm:mx-auto sm:max-w-sm lg:col-span-5 lg:mr-0 xl:col-span-4 xl:col-start-9">
          <h1 className="animate-fade-up font-headline text-4xl leading-[0.95] [animation-delay:80ms]">{t.password.title}</h1>
          <p className="mt-2 mb-6 animate-fade-up text-sm text-muted [animation-delay:120ms]">{fmt(t.password.intro, { min: 8 })}</p>
          <PasswordForm />
        </div>
      </div>
    </main>
  );
}
