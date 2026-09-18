import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRAINING_PHOTOS_BUCKET, type TrainingPhoto } from "@/lib/twin";
import { PhotoUploader } from "./photo-uploader";

export const metadata: Metadata = {
  title: "Crée ton jumeau — TwinPost",
};

// startTraining télécharge et zippe jusqu'à 30 photos avant d'appeler Replicate.
export const maxDuration = 120;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function TrainPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    redirect("/login");
  }

  // On reprend le jumeau en cours de création s'il y en a un ; sinon, un
  // nouveau jumeau est créé au premier upload. Les autres jumeaux (prêts,
  // en entraînement) ne bloquent pas la création.
  const { data: pending } = await supabase
    .from("twins")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pendingTwinId = pending?.id ?? null;
  let photos: TrainingPhoto[] = [];

  if (pendingTwinId) {
    const { data: rows } = await supabase
      .from("training_photos")
      .select("id, file_name, storage_path")
      .eq("twin_id", pendingTwinId)
      .order("uploaded_at");

    const paths = (rows ?? []).map((r) => r.storage_path);
    const { data: signed } = paths.length
      ? await supabase.storage
          .from(TRAINING_PHOTOS_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      : { data: [] };
    const urlByPath = new Map(
      (signed ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]),
    );

    photos = (rows ?? []).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      storagePath: r.storage_path,
      url: urlByPath.get(r.storage_path) ?? null,
    }));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl">
        {pendingTwinId ? "Termine ton jumeau IA" : "Nouveau jumeau IA"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        Uploade 20 à 30 photos de toi. Plus elles sont variées, plus ton jumeau
        sera réaliste.
      </p>

      <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
        {[
          "Visage bien visible et net",
          "Éclairages et décors variés",
          "Plusieurs angles et expressions",
          "Pas de lunettes de soleil, ni de filtre",
          "Seul sur la photo",
          "JPG, PNG ou WebP, 10 Mo max",
        ].map((tip) => (
          <li key={tip} className="flex items-center gap-2 text-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-neon-cyan" />
            {tip}
          </li>
        ))}
      </ul>

      <PhotoUploader
        userId={auth.claims.sub}
        initialTwinId={pendingTwinId}
        initialPhotos={photos}
      />
    </div>
  );
}
