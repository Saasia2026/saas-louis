import type { Metadata } from "next";
import { LanguageSwitcher } from "@/app/language-switcher";
import { LogoMark } from "@/app/logo-mark";
import { getDictionary } from "@/i18n/server";
import { AuthForm } from "./auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.login} — TwinPost` };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const t = await getDictionary();

  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[26rem] w-[44rem] -translate-x-1/2 animate-aurora rounded-full bg-[radial-gradient(closest-side,rgb(91_124_255/0.3),transparent)] blur-3xl"
      />
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <LogoMark className="size-16" />
        </div>
        <h1 className="text-gradient mt-8 animate-fade-up text-center text-3xl font-semibold tracking-tight [animation-delay:80ms]">
          {t.login.welcome}
        </h1>
        <p className="mt-2 mb-8 animate-fade-up text-center text-sm text-muted [animation-delay:120ms]">
          {t.login.tagline}
        </p>
        <AuthForm
          next={typeof next === "string" ? next : undefined}
          initialError={
            error === "lien_invalide"
              ? t.login.invalidLink
              : undefined
          }
        />
        <p className="mt-6 text-center text-xs text-faint">{t.login.freeCredits}</p>
      </div>
    </main>
  );
}
