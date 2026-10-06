import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/app/language-switcher";
import { LogoMark } from "@/app/logo-mark";
import { ThemeToggle } from "@/app/theme-toggle";
import { ParticleField } from "@/app/particle-field";
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
    <main className="relative isolate flex flex-1 items-stretch">
      <ParticleField />
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <LogoMark className="size-16" />
        </div>
        <h1 className="text-gradient mt-8 animate-fade-up text-center font-headline text-4xl leading-[0.95] [animation-delay:80ms]">
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
        <p className="mt-2 text-center text-xs text-faint">
          {t.terms.accept}{" "}
          <Link href="/conditions" className="underline hover:text-text">
            {t.terms.link.toLowerCase()}
          </Link>
          .
        </p>
      </div>
      </div>

      {/* Œuvre générée (voir public/login-art.webp) : le côté galerie de la
          page, masqué sur petit écran. */}
      <aside aria-hidden className="relative hidden w-[42%] p-4 lg:block">
        <div className="relative size-full overflow-hidden rounded-2xl border border-line bg-black">
          <Image
            src="/login-art.webp"
            alt=""
            fill
            sizes="42vw"
            priority
            className="object-cover"
          />
        </div>
      </aside>
    </main>
  );
}
