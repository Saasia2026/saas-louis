import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRAINING_PHOTOS_BUCKET } from "@/lib/twin";
import { TwinSettings } from "../twin-settings";

export const metadata: Metadata = {
  title: "Mon jumeau — TwinPost",
};

// Photos montrées sur la page : celles que les modèles reçoivent en référence
// sont réparties sur toute la série.
const PREVIEW_PHOTOS = 8;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const primaryButton =
  "inline-block rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink px-4 py-2.5 font-semibold text-white";

export default async function TwinPage(props: PageProps<"/dashboard/twins/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: twin } = await supabase
    .from("twins")
    .select("id, name, status, consent_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (!twin) notFound();

  const usable = twin.status === "ready" && !!twin.consent_confirmed_at;

  let photoUrls: string[] = [];
  if (usable) {
    const { data: photos } = await supabase
      .from("training_photos")
      .select("storage_path")
      .eq("twin_id", twin.id)
      .order("uploaded_at")
      .limit(PREVIEW_PHOTOS);
    const paths = (photos ?? []).map((p) => p.storage_path);
    const { data: signed } = paths.length
      ? await supabase.storage
          .from(TRAINING_PHOTOS_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      : { data: [] };
    photoUrls = (signed ?? []).flatMap((s) => (s.signedUrl && !s.error ? [s.signedUrl] : []));
  }

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
            <div className="rounded-2xl border border-white/10 bg-card p-6">
              <h2 className="text-lg font-semibold">Jumeau prêt</h2>
              <p className="mt-1 text-sm text-muted">
                Tes photos servent de références pour chaque photo et vidéo générée.
              </p>
              <ul className="mt-4 grid grid-cols-4 gap-2">
                {photoUrls.map((url) => (
                  <li key={url} className="aspect-square overflow-hidden rounded-lg bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-card p-6">
              {twin.status === "pending" ? (
                <>
                  <h2 className="text-lg font-semibold">Création en cours</h2>
                  <p className="mt-1 text-sm text-muted">
                    Ajoute tes photos puis valide ton jumeau.
                  </p>
                  <Link href="/dashboard/train" className={`mt-4 ${primaryButton}`}>
                    Continuer l&apos;upload
                  </Link>
                </>
              ) : twin.status === "ready" ? (
                <>
                  <h2 className="text-lg font-semibold">Jumeau inutilisable</h2>
                  <p className="mt-1 text-sm text-muted">
                    Ce jumeau a été créé avant l&apos;attestation « ces photos
                    sont de moi ». Supprime-le et crée un nouveau jumeau avec tes
                    propres photos.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">Jumeau inutilisable</h2>
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
