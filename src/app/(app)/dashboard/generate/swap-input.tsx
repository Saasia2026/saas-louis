"use client";

import { Film, Mountain, Plus, ScanFace, Sparkles, UserRound, X } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
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

// Un personnage, ses autres photos (Qualité max : visage, profil…) et qui il
// remplace dans le clip (facultatif s'il est seul).
export type SwapCharacter = { image: SwapFile | null; extras: SwapFile[]; target: string };

// Début du passage gardé, ramené dans le clip : la durée gardée change avec
// le moteur, le début choisi reste tel quel dans l'état.
export function clampedStart(file: SwapFile, maxSeconds: number) {
  const start = file.start ?? 0;
  return Number.isFinite(file.seconds)
    ? Math.min(start, Math.max(0, Math.floor(file.seconds! - maxSeconds)))
    : start;
}

// Zone de saisie du studio : le clip filmé à reprendre et l'image de chaque
// personnage qui prendra la place d'une personne du clip.
export function SwapInput({
  userId,
  video,
  onVideo,
  characters,
  onCharacters,
  maxCharacters,
  maxPhotos,
  maxSeconds,
  compact,
  facePhoto = null,
  onFacePhoto,
  showFacePhoto = false,
  decorPhoto = null,
  onDecorPhoto,
  showDecor = false,
  instructions = "",
  onInstructions,
  showInstructions = false,
  presetPeople,
}: {
  userId: string;
  video: SwapFile | null;
  onVideo: (file: SwapFile | null) => void;
  // Option « + visage exact » : photo du visage posé par Magic Hour, à part
  // de celle du personnage (qui seule passe par le moteur vidéo).
  facePhoto?: SwapFile | null;
  onFacePhoto?: (file: SwapFile | null) => void;
  showFacePhoto?: boolean;
  // Changement de décor (moteur Qualité max) : photo du lieu, facultative.
  // Sans photo, le décor du clip est gardé.
  decorPhoto?: SwapFile | null;
  onDecorPhoto?: (file: SwapFile | null) => void;
  showDecor?: boolean;
  // Consignes libres à l'IA (moteur Qualité max), facultatives : demandes en
  // plus du remplacement (« transforme la chaise en voiture de sport »).
  // Vides : seuls les références et les champs remplis comptent.
  instructions?: string;
  onInstructions?: (text: string) => void;
  showInstructions?: boolean;
  // Plan prêt : qui chaque personnage remplace, déjà fixé (un libellé par
  // personnage, dans la langue du site) ; les personnages ne se retirent pas.
  presetPeople?: string[];
  // Au moins un personnage ; plusieurs si le moteur Qualité max est là.
  characters: SwapCharacter[];
  onCharacters: Dispatch<SetStateAction<SwapCharacter[]>>;
  maxCharacters: number;
  // Photos par personnage, la principale comprise (1 : pas d'autres photos).
  maxPhotos: number;
  // Durée gardée au plus, selon le moteur choisi.
  maxSeconds: number;
  compact: boolean;
}) {
  const [supabase] = useState(createClient);
  const { t } = useI18n();
  // Case en cours d'envoi : le clip, le numéro du personnage, ou « extra-N »
  // pour une autre photo du personnage N.
  const [uploading, setUploading] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const several = characters.length > 1;

  const setCharacter = (index: number, change: Partial<SwapCharacter>) =>
    onCharacters((list) => list.map((c, i) => (i === index ? { ...c, ...change } : c)));

  function removeCharacter(index: number) {
    const character = characters[index];
    for (const f of [character?.image, ...(character?.extras ?? [])]) {
      if (f) URL.revokeObjectURL(f.previewUrl);
    }
    onCharacters((list) => list.filter((_, i) => i !== index));
  }

  // Dépose un fichier dans swap-inputs ; null si refusé ou raté (erreur affichée).
  async function upload(slot: string | number, kind: "video" | "image", file: File | undefined) {
    if (!file) return null;
    setError(null);
    const types = kind === "video" ? SWAP_VIDEO_TYPES : SWAP_IMAGE_TYPES;
    if (!types.includes(file.type)) return (setError(t.generateErrors.swapFormat), null);
    if (file.size > SWAP_MAX_BYTES) return (setError(t.generateErrors.swapTooBig), null);

    setUploading(slot);
    const previewUrl = URL.createObjectURL(file);
    const [seconds, stored] = await Promise.all([
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
    if (!stored) {
      URL.revokeObjectURL(previewUrl);
      setError(t.generateErrors.swapUpload);
      return null;
    }
    return { path: stored, previewUrl, seconds, start: 0 } satisfies SwapFile;
  }

  async function pickExtra(index: number, file: File | undefined) {
    const next = await upload(`extra-${index}`, "image", file);
    if (!next) return;
    onCharacters((list) =>
      list.map((c, i) => (i === index ? { ...c, extras: [...c.extras, next].slice(0, maxPhotos - 1) } : c)),
    );
  }

  function removeExtra(index: number, file: SwapFile) {
    URL.revokeObjectURL(file.previewUrl);
    onCharacters((list) =>
      list.map((c, i) => (i === index ? { ...c, extras: c.extras.filter((f) => f !== file) } : c)),
    );
  }

  async function pick(slot: "video" | "face" | "decor" | number, file: File | undefined) {
    const next = await upload(slot, slot === "video" ? "video" : "image", file);
    if (!next) return;
    if (slot === "video") {
      if (video) URL.revokeObjectURL(video.previewUrl);
      onVideo(next);
    } else if (slot === "face") {
      if (facePhoto) URL.revokeObjectURL(facePhoto.previewUrl);
      onFacePhoto?.(next);
    } else if (slot === "decor") {
      if (decorPhoto) URL.revokeObjectURL(decorPhoto.previewUrl);
      onDecorPhoto?.(next);
    } else {
      const current = characters[slot]?.image;
      if (current) URL.revokeObjectURL(current.previewUrl);
      setCharacter(slot, { image: next });
    }
  }

  const tile = (slot: "video" | "face" | number) => {
    const kind = slot === "video" ? "video" : "image";
    const file = slot === "video" ? video : slot === "face" ? facePhoto : characters[slot]?.image;
    const Icon = kind === "video" ? Film : slot === "face" ? ScanFace : UserRound;
    return (
      <label
        key={slot}
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
            pick(slot, e.target.files?.[0]);
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
              {t.studio.change}
            </span>
          </>
        ) : (
          <>
            <Icon className="size-5 text-muted" />
            <span className="text-sm font-medium">
              {kind === "video" ? t.studio.video : slot === "face" ? t.studio.faceImage : t.studio.image}
            </span>
            {!compact && !(several && typeof slot === "number") && (
              <span className="px-3 text-xs text-faint">
                {kind === "video"
                  ? fmt(t.studio.videoHint, { max: maxSeconds })
                  : slot === "face"
                    ? t.studio.faceImageHint
                    : t.studio.imageHint}
              </span>
            )}
          </>
        )}
        {several && typeof slot === "number" && (
          <>
            <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white tabular-nums">
              {slot + 1}
            </span>
            {!presetPeople && (
              <button
                type="button"
                aria-label={t.studio.removeCharacter}
                title={t.studio.removeCharacter}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeCharacter(slot);
                }}
                className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
              >
                <X className="size-4" />
              </button>
            )}
          </>
        )}
        {uploading === slot && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
            {t.studio.uploading}
          </span>
        )}
      </label>
    );
  };

  const targetField =
    "w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent/60";

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="grid grid-cols-2 gap-3">
        {tile("video")}
        {characters.map((_, i) => tile(i))}
        {showFacePhoto && tile("face")}
      </div>
      {characters.length < maxCharacters && characters[0]?.image && (
        <button
          type="button"
          onClick={() => onCharacters((list) => [...list, { image: null, extras: [], target: "" }])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/60 hover:text-text"
        >
          <Plus className="size-4" />
          {t.studio.addCharacter}
        </button>
      )}
      {maxPhotos > 1 &&
        characters.map((c, i) =>
          c.image ? (
            <div key={`photos-${i}`} className="mt-3">
              <p className="text-xs text-faint">
                {several
                  ? fmt(t.studio.morePhotos, { n: i + 1, max: maxPhotos })
                  : fmt(t.studio.morePhotosSingle, { max: maxPhotos })}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {c.extras.map((f) => (
                  <span
                    key={f.path}
                    className="relative size-12 overflow-hidden rounded-lg border border-line bg-black"
                  >
                    {/* Aperçu local (blob:) : pas d'optimisation Next. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.previewUrl} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label={t.studio.removePhoto}
                      title={t.studio.removePhoto}
                      onClick={() => removeExtra(i, f)}
                      className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {1 + c.extras.length < maxPhotos && (
                  <label
                    title={t.studio.addPhoto}
                    className="relative flex size-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong text-muted transition-colors hover:border-accent/60 hover:text-text"
                  >
                    <input
                      type="file"
                      accept={SWAP_IMAGE_TYPES.join(",")}
                      className="sr-only"
                      aria-label={t.studio.addPhoto}
                      disabled={uploading !== null}
                      onChange={(e) => {
                        pickExtra(i, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    {uploading === `extra-${i}` ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </label>
                )}
              </div>
            </div>
          ) : null,
        )}
      {presetPeople ? (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {presetPeople.map((label, i) => (
            <li key={i} className="flex items-center gap-2">
              {several && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
              )}
              {several ? label : fmt(t.studio.presetTarget, { who: label })}
            </li>
          ))}
        </ul>
      ) : several ? (
        <div className="mt-3 space-y-2">
          {characters.map((c, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white tabular-nums">
                {i + 1}
              </span>
              <input
                value={c.target}
                onChange={(e) => setCharacter(i, { target: e.target.value })}
                maxLength={200}
                placeholder={fmt(t.studio.characterTarget, { n: i + 1 })}
                className={targetField}
              />
            </label>
          ))}
        </div>
      ) : (
        video && (
          <input
            value={characters[0]?.target ?? ""}
            onChange={(e) => setCharacter(0, { target: e.target.value })}
            maxLength={200}
            placeholder={t.studio.targetPlaceholder}
            aria-label={t.studio.target}
            className={`mt-3 ${targetField}`}
          />
        )
      )}
      {showDecor && (
        <div className="mt-3">
          <p className="text-xs text-faint">{t.studio.decorTitle}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <label
              title={t.studio.decorImage}
              className={`group relative flex h-20 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors ${
                decorPhoto
                  ? "border-line bg-black"
                  : "border-line-strong bg-surface-2/60 hover:border-accent/60"
              }`}
            >
              <input
                type="file"
                accept={SWAP_IMAGE_TYPES.join(",")}
                className="sr-only"
                aria-label={t.studio.decorImage}
                disabled={uploading !== null}
                onChange={(e) => {
                  pick("decor", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {decorPhoto ? (
                // Aperçu local (blob:) : pas d'optimisation Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={decorPhoto.previewUrl} alt="" className="size-full object-cover" />
              ) : (
                <Mountain className="size-5 text-muted" />
              )}
              {uploading === "decor" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
                  {t.studio.uploading}
                </span>
              )}
            </label>
            {decorPhoto ? (
              <button
                type="button"
                aria-label={t.studio.removePhoto}
                title={t.studio.removePhoto}
                onClick={() => {
                  URL.revokeObjectURL(decorPhoto.previewUrl);
                  onDecorPhoto?.(null);
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted hover:text-text"
              >
                <X className="size-4" />
              </button>
            ) : (
              <p className="text-xs text-faint">{t.studio.decorHint}</p>
            )}
          </div>
        </div>
      )}
      {showInstructions && (
        <label className="mt-3 flex items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3 focus-within:border-accent/60">
          <Sparkles className="size-4 shrink-0 text-muted" />
          <input
            value={instructions}
            onChange={(e) => onInstructions?.(e.target.value)}
            maxLength={500}
            placeholder={t.studio.instructionsPlaceholder}
            aria-label={t.studio.instructions}
            className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-faint"
          />
        </label>
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
        !compact && <p className="mt-2 text-xs text-faint">{t.studio.explain}</p>
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
          {fmt(t.studio.segment, { max: maxSeconds })}
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
