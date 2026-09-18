import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TRAINING_PHOTOS_BUCKET } from "@/lib/twin";

const primaryButton =
  "inline-block rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink px-4 py-2.5 font-semibold text-white";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type Badge = { label: string; className: string };

function badgeOf(twin: { status: string; consent_confirmed_at: string | null }): Badge {
  if (twin.status === "ready" && twin.consent_confirmed_at) {
    return { label: "Prêt", className: "border-neon-cyan/40 text-neon-cyan" };
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
  // Couverture de chaque jumeau : sa première photo.
  const { data } = await supabase
    .from("twins")
    .select("id, name, status, consent_confirmed_at, training_photos(storage_path)")
    .order("created_at", { ascending: false })
    .order("uploaded_at", { referencedTable: "training_photos" })
    .limit(1, { referencedTable: "training_photos" });
  const twins = (data ?? []).map(({ training_photos, ...twin }) => ({
    ...twin,
    cover: training_photos[0]?.storage_path ?? null,
  }));

  const imagePaths = twins.flatMap((t) => (t.cover ? [t.cover] : []));
  const { data: signed } = imagePaths.length
    ? await supabase.storage
        .from(TRAINING_PHOTOS_BUCKET)
        .createSignedUrls(imagePaths, SIGNED_URL_TTL_SECONDS)
    : { data: [] };
  const imageByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]),
  );

  const hasPending = twins.some((t) => t.status === "pending");

  return (
    <div className="mx-auto max-w-5xl">
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
            Uploade 20 à 30 photos de toi pour créer ton jumeau.
          </p>
          <Link href="/dashboard/train" className={`mt-4 ${primaryButton}`}>
            Crée ton jumeau IA
          </Link>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {twins.map((twin) => {
            const badge = badgeOf(twin);
            const image = twin.cover ? imageByPath.get(twin.cover) : null;
            return (
              <li key={twin.id}>
                <Link
                  href={`/dashboard/twins/${twin.id}`}
                  className="group block overflow-hidden rounded-2xl border border-white/10 bg-card transition-colors hover:border-neon-purple"
                >
                  <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-b from-neon-purple/10 to-transparent">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
                      <img src={image} alt="" className="h-full w-full object-cover" />
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
