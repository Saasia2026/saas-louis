"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MIN_PHOTOS,
  TRAINING_PHOTOS_BUCKET,
  type TrainingPhoto,
} from "@/lib/twin";
import { activateTwin, ensurePendingTwin } from "./actions";

const UPLOAD_CONCURRENCY = 3;

type Pending = {
  key: string;
  fileName: string;
  previewUrl: string;
  error?: string;
};

export function PhotoUploader({
  userId,
  initialTwinId,
  initialPhotos,
}: {
  userId: string;
  initialTwinId: string | null;
  initialPhotos: TrainingPhoto[];
}) {
  const [supabase] = useState(createClient);
  const [photos, setPhotos] = useState(initialPhotos);
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [consent, setConsent] = useState(false);
  const [training, startTrainingTransition] = useTransition();
  const twinIdRef = useRef<Promise<string> | null>(
    initialTwinId ? Promise.resolve(initialTwinId) : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const uploading = pending.filter((p) => !p.error).length;
  const count = photos.length;
  const canTrain = count >= MIN_PHOTOS && uploading === 0;

  function getTwinId() {
    if (!twinIdRef.current) {
      twinIdRef.current = ensurePendingTwin().then((res) => {
        if (res.error !== undefined) {
          twinIdRef.current = null;
          throw new Error(res.error);
        }
        return res.data.twinId;
      });
    }
    return twinIdRef.current;
  }

  async function uploadOne(item: Pending, file: File) {
    try {
      const twinId = await getTwinId();
      const ext = ACCEPTED_PHOTO_TYPES[file.type];
      const storagePath = `${userId}/${twinId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(TRAINING_PHOTOS_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("Échec de l'envoi.");

      const { data: row, error: insertError } = await supabase
        .from("training_photos")
        .insert({ twin_id: twinId, storage_path: storagePath, file_name: file.name })
        .select("id")
        .single();
      if (insertError) {
        await supabase.storage.from(TRAINING_PHOTOS_BUCKET).remove([storagePath]);
        throw new Error(
          insertError.message.includes("training_photo_limit")
            ? `Maximum ${MAX_PHOTOS} photos atteint.`
            : "Envoi refusé. Recharge la page.",
        );
      }

      setPhotos((prev) => [
        ...prev,
        { id: row.id, fileName: file.name, storagePath, url: item.previewUrl },
      ]);
      setPending((prev) => prev.filter((p) => p.key !== item.key));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Échec de l'envoi.";
      setPending((prev) =>
        prev.map((p) => (p.key === item.key ? { ...p, error: message } : p)),
      );
    }
  }

  async function addFiles(fileList: FileList | File[]) {
    setNotice(null);
    const files = Array.from(fileList);
    const slots = MAX_PHOTOS - count - uploading;
    const rejected: string[] = [];
    const queue: { item: Pending; file: File }[] = [];

    for (const file of files) {
      if (!ACCEPTED_PHOTO_TYPES[file.type]) {
        rejected.push(`${file.name} : format non accepté`);
      } else if (file.size > MAX_PHOTO_BYTES) {
        rejected.push(`${file.name} : plus de 10 Mo`);
      } else if (queue.length >= slots) {
        rejected.push(`${file.name} : maximum ${MAX_PHOTOS} photos`);
      } else {
        const previewUrl = URL.createObjectURL(file);
        objectUrls.current.push(previewUrl);
        queue.push({
          item: { key: crypto.randomUUID(), fileName: file.name, previewUrl },
          file,
        });
      }
    }

    if (rejected.length) setNotice(rejected.join(" · "));
    if (!queue.length) return;
    setPending((prev) => [...prev, ...queue.map((q) => q.item)]);

    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const { item, file } = queue[next++];
        await uploadOne(item, file);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker),
    );
  }

  async function removePhoto(photo: TrainingPhoto) {
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    const { error } = await supabase
      .from("training_photos")
      .delete()
      .eq("id", photo.id);
    if (error) {
      setPhotos((prev) => [...prev, photo]);
      setNotice("Suppression impossible. Réessaie.");
      return;
    }
    await supabase.storage.from(TRAINING_PHOTOS_BUCKET).remove([photo.storagePath]);
  }

  function dismiss(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  function onTrain() {
    setNotice(null);
    startTrainingTransition(async () => {
      const twinId = await twinIdRef.current;
      if (!twinId) return;
      const res = await activateTwin(twinId, consent);
      if (res.error !== undefined) setNotice(res.error);
    });
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        disabled={count + uploading >= MAX_PHOTOS}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging
            ? "border-neon-cyan bg-neon-cyan/5"
            : "border-white/15 bg-card hover:border-neon-purple"
        }`}
      >
        <span className="font-semibold">
          Glisse tes photos ici ou clique pour les choisir
        </span>
        <span className="text-sm text-muted">JPG, PNG ou WebP · 10 Mo max par photo</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(ACCEPTED_PHOTO_TYPES).join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-48 flex-1">
          <p className="text-sm">
            <span className={count >= MIN_PHOTOS ? "text-neon-cyan" : ""}>
              {count}/{MAX_PHOTOS} photos
            </span>
            <span className="text-muted">
              {count < MIN_PHOTOS
                ? ` · encore ${MIN_PHOTOS - count} minimum`
                : " · prêt"}
              {uploading > 0 && ` · ${uploading} en cours d'envoi`}
            </span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-cyan transition-all"
              style={{ width: `${(count / MAX_PHOTOS) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onTrain}
          disabled={!canTrain || !consent || training}
          className="rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {training ? "Création…" : "Créer mon jumeau"}
        </button>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-card p-4 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--neon-purple)]"
        />
        <span>
          Je certifie que <strong>ces photos sont de moi</strong> et que j&apos;utiliserai
          mon jumeau uniquement pour créer des contenus me représentant.
          <span className="block text-xs text-muted">
            Créer un jumeau d&apos;une autre personne sans son accord est interdit.
          </span>
        </span>
      </label>

      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-neon-pink">
        {notice}
      </p>

      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {photos.map((photo) => (
          <li
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-xl bg-card"
          >
            {photo.url && (
              // Images privées (URL signée ou blob local) : pas d'optimisation Next.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt={photo.fileName} className="size-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => removePhoto(photo)}
              aria-label={`Supprimer ${photo.fileName}`}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-sm opacity-100 transition-opacity hover:bg-neon-pink sm:opacity-0 sm:group-hover:opacity-100"
            >
              ✕
            </button>
          </li>
        ))}
        {pending.map((p) => (
          <li
            key={p.key}
            className="relative aspect-square overflow-hidden rounded-xl bg-card"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt={p.fileName} className="size-full object-cover opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-xs">
              {p.error ? (
                <>
                  <span className="text-neon-pink">{p.error}</span>
                  <button
                    type="button"
                    onClick={() => dismiss(p.key)}
                    className="underline"
                  >
                    Retirer
                  </button>
                </>
              ) : (
                <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-neon-cyan" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
