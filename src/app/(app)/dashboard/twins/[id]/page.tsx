import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "../../auto-refresh";
import { TrainingProgress, syncTraining } from "../training";
import { TwinModelViewer } from "../twin-model-viewer";
import { TwinSettings } from "../twin-settings";

export const metadata: Metadata = {
  title: "Mon jumeau — TwinPost",
};

// La copie du fichier 3D (plusieurs Mo) passe par les server actions de la page.
export const maxDuration = 120;

const TRAINING_POLL_MS = 30_000;

const primaryButton =
  "inline-block rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink px-4 py-2.5 font-semibold text-white";

export default async function TwinPage(props: PageProps<"/dashboard/twins/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const selectTwin = () =>
    supabase
      .from("twins")
      .select(
        "id, name, status, replicate_training_id, training_started_at, consent_confirmed_at, created_at",
      )
      .eq("id", id)
      .maybeSingle();

  let { data: twin } = await selectTwin();
  if (!twin) notFound();
  if (await syncTraining(twin)) {
    ({ data: twin } = await selectTwin());
    if (!twin) notFound();
  }

  const usable = twin.status === "ready" && !!twin.consent_confirmed_at;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-sm text-muted hover:text-text">
        ← Mes jumeaux
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl">{twin.name}</h1>
        {usable && (
          <Link href={`/dashboard/generate?twin=${twin.id}`} className={primaryButton}>
            Créer une vidéo ou une photo
          </Link>
        )}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[3fr_2fr]">
        <section>
          {usable ? (
            <TwinModelViewer twinId={twin.id} name={twin.name} />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-card p-6">
              {twin.status === "pending" ? (
                <>
                  <h2 className="text-lg font-semibold">Création en cours</h2>
                  <p className="mt-1 text-sm text-muted">
                    Ajoute tes photos puis lance l&apos;entraînement. Le modèle 3D
                    sera créé automatiquement ensuite.
                  </p>
                  <Link href="/dashboard/train" className={`mt-4 ${primaryButton}`}>
                    Continuer l&apos;upload
                  </Link>
                </>
              ) : twin.status === "training" ? (
                <>
                  <AutoRefresh intervalMs={TRAINING_POLL_MS} />
                  <h2 className="text-lg font-semibold">Entraînement en cours</h2>
                  <p className="mt-1 text-sm text-muted">
                    Compte environ 20 à 30 minutes. Tu peux fermer cette page : le
                    modèle 3D apparaîtra ici une fois le jumeau prêt.
                  </p>
                  <TrainingProgress startedAt={twin.training_started_at} />
                </>
              ) : twin.status === "ready" ? (
                <>
                  <h2 className="text-lg font-semibold">Jumeau inutilisable</h2>
                  <p className="mt-1 text-sm text-muted">
                    Ce jumeau a été entraîné avant l&apos;attestation « ces photos
                    sont de moi ». Supprime-le et crée un nouveau jumeau avec tes
                    propres photos.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">L&apos;entraînement a échoué</h2>
                  <p className="mt-1 text-sm text-muted">
                    Supprime ce jumeau et recommence avec d&apos;autres photos.
                  </p>
                  <Link
                    href="/dashboard/train"
                    className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2.5 font-semibold"
                  >
                    Nouveau jumeau
                  </Link>
                </>
              )}
            </div>
          )}
        </section>

        <aside>
          <TwinSettings key={twin.name} twinId={twin.id} name={twin.name} />
        </aside>
      </div>
    </div>
  );
}
