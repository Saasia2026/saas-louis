import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
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
    <div>
      <PageHeader eyebrow="Bibliothèque" title="Personnages">
        Un personnage garde le même sujet d&apos;une vidéo à l&apos;autre : une personne, un
        animal ou un produit. Il s&apos;utilise ensuite dans la génération.
      </PageHeader>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <CharacterUploader userId={auth.claims.sub} />

        <section className="panel p-6">
          <h2 className="text-base font-semibold">Déjà créés</h2>
          {characters?.length ? (
            <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
              {characters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-right text-xs ${
                      c.status === "ready"
                        ? "bg-success/10 text-success"
                        : c.status === "failed"
                          ? "bg-danger/10 text-danger"
                          : "bg-surface-3 text-muted"
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
            className="btn btn-secondary mt-5"
          >
            Aller à la génération →
          </Link>
        </section>
      </div>
    </div>
  );
}
