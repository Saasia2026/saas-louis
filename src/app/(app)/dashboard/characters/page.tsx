import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CharacterUploader } from "./character-uploader";

export const metadata: Metadata = {
  title: "Personnages — TwinPost",
};

// La création d'un personnage attend la réponse de Sora (~30 s).
export const maxDuration = 120;

const STATUS_LABELS: Record<string, string> = {
  pending: "Création en cours…",
  ready: "Prêt",
  failed: "Échec",
};

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    redirect("/login");
  }

  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, status, error, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl">Tes personnages</h1>
      <p className="mt-2 text-sm text-muted">
        Un personnage garde le même sujet d&apos;une vidéo à l&apos;autre : une personne, un
        animal ou un produit. Il s&apos;utilise ensuite dans la génération.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <CharacterUploader userId={auth.claims.sub} />

        <section className="rounded-2xl border border-white/10 p-5">
          <h2 className="font-display text-lg">Déjà créés</h2>
          {characters?.length ? (
            <ul className="mt-4 flex flex-col gap-3">
              {characters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3"
                >
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`text-xs ${
                      c.status === "ready"
                        ? "text-neon-cyan"
                        : c.status === "failed"
                          ? "text-neon-pink"
                          : "text-muted"
                    }`}
                  >
                    {c.error ?? STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Aucun personnage pour l&apos;instant. Envoie une première vidéo.
            </p>
          )}

          <Link
            href="/dashboard/generate"
            className="mt-5 inline-block text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Aller à la génération
          </Link>
        </section>
      </div>
    </div>
  );
}
