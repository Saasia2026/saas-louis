import type { Metadata } from "next";
import { LogoMark } from "@/app/logo-mark";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = {
  title: "Connexion — TwinPost",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center px-4 py-16">
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
          Bienvenue dans le studio
        </h1>
        <p className="mt-2 mb-8 animate-fade-up text-center text-sm text-muted [animation-delay:120ms]">
          Décris ta vidéo, l&apos;IA la réalise.
        </p>
        <AuthForm
          next={typeof next === "string" ? next : undefined}
          initialError={
            error === "lien_invalide"
              ? "Ce lien de confirmation est invalide ou a expiré."
              : undefined
          }
        />
        <p className="mt-6 text-center text-xs text-faint">3 crédits offerts à l&apos;inscription</p>
      </div>
    </main>
  );
}
