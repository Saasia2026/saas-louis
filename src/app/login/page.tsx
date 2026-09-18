import type { Metadata } from "next";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = {
  title: "Connexion — TwinPost",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-center">
          Twin<span className="text-neon-purple">Post</span>
        </h1>
        <p className="mt-2 mb-8 text-center text-sm text-muted">
          Ton jumeau IA, dans n&apos;importe quel décor.
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
