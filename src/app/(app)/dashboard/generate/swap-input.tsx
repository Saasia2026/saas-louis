"use client";

import { Film, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  SWAP_IMAGE_TYPES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_BYTES,
  SWAP_VIDEO_TYPES,
} from "@/lib/generation";
import { createClient } from "@/lib/supabase/client";

// Fichier déposé dans swap-inputs. `seconds` : durée lue par le navigateur,
// pour afficher le coût (le serveur la remesure) ; NaN s'il ne sait pas la
// lire (certains .mov). `start` : début du passage gardé d'un clip plus
// long que la durée du moteur (`maxSeconds`), découpé par le serveur.
export type SwapFile = { path: string; previewUrl: string; seconds?: number; start?: number };

// Début du passage gardé, ramené dans le clip : la durée gardée change avec
// le moteur, le début choisi reste tel quel dans l'état.
export function clampedStart(file: SwapFile, maxSeconds: number) {
  const start = file.start ?? 0;
  return Number.isFinite(file.seconds)
    ? Math.min(start, Math.max(0, Math.floor(file.seconds! - maxSeconds)))
    : start;
}

// Zone de saisie du mode Remplacer : le clip filmé à reprendre et l'image du
// personnage qui prendra la place de la personne du clip.
export function SwapInput({
  userId,
  video,
  image,
  onVideo,
  onImage,
  target,
  onTarget,
  maxSeconds,
  compact,
}: {
  userId: string;
  video: SwapFile | null;
  image: SwapFile | null;
  onVideo: (file: SwapFile | null) => void;
  onImage: (file: SwapFile | null) => void;
  // Qui remplacer, quand plusieurs personnes sont à l'image.
  target: string;
  onTarget: (target: string) => void;
  // Durée gardée au plus, selon le moteur choisi.
  maxSeconds: number;
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
    (kind === "video" ? onVideo : onImage)({ path: upload, previewUrl, seconds, start: 0 });
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
              <SegmentPreview file={file} maxSeconds={maxSeconds} />
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
                  ? fmt(t.studio.swapVideoHint, { max: maxSeconds })
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
      {video && (
        <input
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          maxLength={200}
          placeholder={t.studio.swapTargetPlaceholder}
          aria-label={t.studio.swapTarget}
          className="mt-3 w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent/60"
        />
      )}
      {video && (video.seconds ?? 0) > maxSeconds + 0.5 && (
        <SegmentPicker
          video={video}
          maxSeconds={maxSeconds}
          onChange={(start) => onVideo({ ...video, start })}
        />
      )}
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

// Aperçu du clip, en boucle sur le passage gardé.
function SegmentPreview({ file, maxSeconds }: { file: SwapFile; maxSeconds: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const start = clampedStart(file, maxSeconds);
  return (
    <video
      ref={ref}
      src={file.previewUrl}
      muted
      autoPlay
      playsInline
      onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        if (el.currentTime < start - 0.3 || el.currentTime >= start + maxSeconds) {
          el.currentTime = start;
          el.play().catch(() => {});
        }
      }}
      onEnded={(e) => {
        e.currentTarget.currentTime = start;
        e.currentTarget.play().catch(() => {});
      }}
      className="absolute inset-0 size-full object-contain"
    />
  );
}

// Clip trop long : le créateur choisit le passage de `maxSeconds` gardé.
function SegmentPicker({
  video,
  maxSeconds,
  onChange,
}: {
  video: SwapFile;
  maxSeconds: number;
  onChange: (start: number) => void;
}) {
  const { t } = useI18n();
  const total = video.seconds ?? 0;
  const max = Math.max(0, Math.floor(total - maxSeconds));
  const start = clampedStart(video, maxSeconds);
  return (
    <label className="mt-3 block">
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-muted">
          {fmt(t.studio.swapSegment, { max: maxSeconds })}
        </span>
        <span className="text-faint tabular-nums">
          {clock(start)} → {clock(start + maxSeconds)} / {clock(total)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={start}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function clock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
