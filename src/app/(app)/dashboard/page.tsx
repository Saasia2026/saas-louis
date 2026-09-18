import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TWIN_MODELS_BUCKET } from "@/lib/twin";
import { AutoRefresh } from "./auto-refresh";
import { TrainingProgress, syncTraining } from "./twins/training";

const primaryButton =
  "inline-block rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink px-4 py-2.5 font-semibold text-white";

const TRAINING_POLL_MS = 30_000;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type Badge = { label: string; className: string };

function badgeOf(twin: { status: string; consent_confirmed_at: string | null }): Badge {
  if (twin.status === "ready" && twin.consent_confirmed_at) {
    return { label: "Prêt", className: "border-neon-cyan/40 text-neon-cyan" };
  }
  if (twin.status === "training") {
    return { label: "Entraînement", className: "border-neon-purple/40 text-neon-purple" };
  }
  if (twin.status === "pending") {
    return { label: "Photos à ajouter", className: "border-white/20 text-muted" };
  }
  if (twin.status === "ready") {
    return { label: "Inutilisable", className: "border-neon-pink/40 text-neon-pink" };
  }
  return { label: "Échec", className: "border-neon-pink/40 text-neon-pink" };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const selectTwins = () =>
    supabase
      .from("twins")
      .select(
        "id, name, status, replicate_training_id, training_started_at, consent_confirmed_at, model_image_path",
      )
      .order("created_at", { ascending: false });

  let { data: twins } = await selectTwins();
  const synced = await Promise.all((twins ?? []).map(syncTraining));
  if (synced.some(Boolean)) ({ data: twins } = await selectTwins());
  twins ??= [];

  const imagePaths = twins.flatMap((t) => (t.model_image_path ? [t.model_image_path] : []));
  const { data: signed } = imagePaths.length
    ? await supabase.storage
        .from(TWIN_MODELS_BUCKET)
        .createSignedUrls(imagePaths, SIGNED_URL_TTL_SECONDS)
    : { data: [] };
  const imageByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]),
  );

  const hasPending = twins.some((t) => t.status === "pending");

  return (
    <div className="mx-auto max-w-5xl">
      {twins.some((t) => t.status === "training") && (
        <AutoRefresh intervalMs={TRAINING_POLL_MS} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Mes jumeaux</h1>
        {twins.length > 0 && (
          <Link href="/dashboard/train" className={primaryButton}>
            {hasPending ? "Continuer le nouveau jumeau" : "+ Nouveau jumeau"}
          </Link>
        )}
      </div>

      {twins.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-white/10 bg-card p-6">
          <h2 className="text-lg font-semibold">Crée ton jumeau IA</h2>
          <p className="mt-1 text-sm text-muted">
            Uploade 20 à 30 photos de toi pour entraîner ton modèle personnel.
          </p>
          <Link href="/dashboard/train" className={`mt-4 ${primaryButton}`}>
            Crée ton jumeau IA
          </Link>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {twins.map((twin) => {
            const badge = badgeOf(twin);
            const image = twin.model_image_path
              ? imageByPath.get(twin.model_image_path)
              : null;
            return (
              <li key={twin.id}>
                <Link
                  href={`/dashboard/twins/${twin.id}`}
                  className="group block overflow-hidden rounded-2xl border border-white/10 bg-card transition-colors hover:border-neon-purple"
                >
                  <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-b from-neon-purple/10 to-transparent">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
                      <img src={image} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-display text-5xl text-white/15">
                        {twin.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate font-semibold">{twin.name}</h2>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    {twin.status === "training" && (
                      <TrainingProgress startedAt={twin.training_started_at} />
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
