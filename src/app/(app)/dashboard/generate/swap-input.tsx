"use client";

import { Film, UserRound } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  SWAP_IMAGE_TYPES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_BYTES,
  SWAP_MAX_SECONDS,
  SWAP_VIDEO_TYPES,
} from "@/lib/generation";
import { createClient } from "@/lib/supabase/client";

// Fichier déposé dans swap-inputs. `seconds` : durée lue par le navigateur,
// pour afficher le coût (le serveur la remesure) ; NaN s'il ne sait pas la
// lire (certains .mov).
export type SwapFile = { path: string; previewUrl: string; seconds?: number };

// Zone de saisie du mode Remplacer : le clip filmé à reprendre et l'image du
// personnage qui prendra la place de la personne du clip.
export function SwapInput({
  userId,
  video,
  image,
  onVideo,
  onImage,
  compact,
}: {
  userId: string;
  video: SwapFile | null;
  image: SwapFile | null;
  onVideo: (file: SwapFile | null) => void;
  onImage: (file: SwapFile | null) => void;
  compact: boolean;
}) {
  const [supabase] = useState(createClient);
  const { t } = useI18n();
  const [uploading, setUploading] = useState<"video" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(kind: "video" | "image", file: File | undefined) {
    if (!file) return;
    setError(null);
    const types = kind === "video" ? SWAP_VIDEO_TYPES : SWAP_IMAGE_TYPES;
    if (!types.includes(file.type)) return setError(t.generateErrors.swapFormat);
    if (file.size > SWAP_MAX_BYTES) return setError(t.generateErrors.swapTooBig);

    setUploading(kind);
    const previewUrl = URL.createObjectURL(file);
    const [seconds, upload] = await Promise.all([
      kind === "video" ? readDuration(previewUrl) : undefined,
      (async () => {
        const path = `${userId}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
        const { error } = await supabase.storage
          .from(SWAP_INPUTS_BUCKET)
          .upload(path, file, { contentType: file.type });
        return error ? null : path;
      })(),
    ]);
    setUploading(null);
    if (!upload) {
      URL.revokeObjectURL(previewUrl);
      return setError(t.generateErrors.swapUpload);
    }
    const current = kind === "video" ? video : image;
    if (current) URL.revokeObjectURL(current.previewUrl);
    (kind === "video" ? onVideo : onImage)({ path: upload, previewUrl, seconds });
  }

  const tile = (kind: "video" | "image") => {
    const file = kind === "video" ? video : image;
    const Icon = kind === "video" ? Film : UserRound;
    return (
      <label
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed text-center transition-colors ${
          file ? "border-line bg-black" : "border-line-strong bg-surface-2/60 hover:border-accent/60"
        } ${compact ? "h-24" : "h-36"}`}
      >
        <input
          type="file"
          accept={(kind === "video" ? SWAP_VIDEO_TYPES : SWAP_IMAGE_TYPES).join(",")}
          className="sr-only"
          disabled={uploading !== null}
          onChange={(e) => {
            pick(kind, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file ? (
          <>
            {kind === "video" ? (
              <video
                src={file.previewUrl}
                muted
                loop
                autoPlay
                playsInline
                className="absolute inset-0 size-full object-contain"
              />
            ) : (
              // Aperçu local (blob:) : pas d'optimisation Next.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.previewUrl} alt="" className="absolute inset-0 size-full object-contain" />
            )}
            <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              {t.studio.swapChange}
            </span>
          </>
        ) : (
          <>
            <Icon className="size-5 text-muted" />
            <span className="text-sm font-medium">
              {kind === "video" ? t.studio.swapVideo : t.studio.swapImage}
            </span>
            {!compact && (
              <span className="px-3 text-xs text-faint">
                {kind === "video"
                  ? fmt(t.studio.swapVideoHint, { max: SWAP_MAX_SECONDS })
                  : t.studio.swapImageHint}
              </span>
            )}
          </>
        )}
        {uploading === kind && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
            {t.studio.swapUploading}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="grid grid-cols-2 gap-3">
        {tile("video")}
        {tile("image")}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-danger">{error}</p>
      ) : (
        !compact && <p className="mt-2 text-xs text-faint">{t.studio.swapExplain}</p>
      )}
    </div>
  );
}

function readDuration(url: string) {
  return new Promise<number>((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => resolve(NaN);
    el.src = url;
  });
}
