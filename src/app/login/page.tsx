import type { Metadata } from "next";
import { Logo } from "@/app/logo";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = {
  title: "Connexion — TwinPost",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight">
          Bienvenue
        </h1>
        <p className="mt-2 mb-8 text-center text-sm text-muted">
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
      </div>
    </main>
  );
}
