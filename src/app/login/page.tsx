import type { Metadata } from "next";
import Link from "next/link";
import { BackdropPhoto } from "@/app/backdrop-photo";
import { LanguageSwitcher } from "@/app/language-switcher";
import { getDictionary } from "@/i18n/server";
import { readRefCode } from "@/lib/referral";
import { AuthForm } from "./auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.login} — TwinPost` };
}

// Connexion sur une vidéo plein cadre, comme la landing : l'accroche à
// gauche, le formulaire dans une carte en verre à droite (en bas sur
// téléphone).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error, from } = await searchParams;
  // Arrivée depuis le studio, projet prêt : on le dit, et on propose
  // d'abord l'inscription.
  const fromStudio = from === "studio";
  const t = await getDictionary();
  const L = t.landing;
  // Venu par un lien partenaire : code prérempli, onglet inscription.
  const refCode = await readRefCode();

  return (
    <main className="video-page relative isolate flex min-h-dvh flex-1 flex-col">
      <BackdropPhoto src="/photos/red-glass.jpg" side="left" focus="50% 35%" />
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
          <p className="mt-5 max-w-sm text-lg leading-snug whitespace-pre-line text-muted">{L.heroText}</p>
        </div>

        <div className="w-full sm:mx-auto sm:max-w-sm lg:col-span-5 lg:mr-0 xl:col-span-4 xl:col-start-9">
          <h1 className="animate-fade-up font-headline text-4xl leading-[0.95] [animation-delay:80ms]">{t.login.welcome}</h1>
          <p className="mt-2 mb-6 animate-fade-up text-sm text-muted [animation-delay:120ms]">
            {fromStudio ? t.login.fromStudio : t.login.tagline}
          </p>
          <AuthForm
            next={typeof next === "string" ? next : undefined}
            initialMode={fromStudio || refCode ? "signup" : "signin"}
            refCode={refCode ?? undefined}
            initialError={error === "lien_invalide" ? t.login.invalidLink : undefined}
          />
          <p className="mt-5 text-xs text-muted">{t.login.freeCredits}</p>
          <p className="mt-1.5 text-xs text-faint">
            {t.terms.accept}{" "}
            <Link href="/conditions" className="underline hover:text-text">
              {t.terms.link.toLowerCase()}
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
