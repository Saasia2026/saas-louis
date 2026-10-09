"use client";

import { Ghost, Mountain, PawPrint, Plus, UserRound, Video, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  GENJUTSU_MIN_SECONDS,
  SWAP_IMAGE_TYPES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_BYTES,
  SWAP_VIDEO_TYPES,
} from "@/lib/generation";
import { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

// Fichier déposé dans swap-inputs. `seconds` : durée lue par le navigateur,
// pour afficher le coût (le serveur la remesure) ; NaN s'il ne sait pas la
// lire (certains .mov). `start` : début du passage gardé d'un clip plus
// long que la durée du moteur (`maxSeconds`), découpé par le serveur.
// `path` vide : visiteur sans compte, le fichier reste dans le navigateur
// (`file`) jusqu'à sa connexion.
export type SwapFile = { path: string; previewUrl: string; seconds?: number; start?: number; file?: File };

// Envoie un fichier dans swap-inputs, sous le dossier de l'utilisateur ;
// null si l'envoi échoue.
export async function uploadSwapFile(supabase: Supabase, userId: string, file: File) {
  const path = `${userId}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
  const { error } = await supabase.storage.from(SWAP_INPUTS_BUCKET).upload(path, file, { contentType: file.type });
  return error ? null : path;
}

export function readDuration(url: string) {
  return new Promise<number>((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => resolve(NaN);
    el.src = url;
  });
}

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
  decorPhoto = null,
  onDecorPhoto,
  showDecor = false,
  decorTitle,
  instructions = "",
  onInstructions,
  showInstructions = false,
  presetPeople,
}: {
  // null : visiteur sans compte, rien n'est envoyé avant sa connexion.
  userId: string | null;
  video: SwapFile | null;
  onVideo: (file: SwapFile | null) => void;
  // Changement de décor : photo du lieu, facultative.
  // Sans photo, le décor du clip est gardé.
  decorPhoto?: SwapFile | null;
  onDecorPhoto?: (file: SwapFile | null) => void;
  showDecor?: boolean;
  // Titre du bloc décor (par défaut : facultatif).
  decorTitle?: string;
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
  const { t, locale } = useI18n();
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

  // Dépose un fichier dans swap-inputs (ou le garde dans le navigateur pour
  // un visiteur) ; null si refusé ou raté (erreur affichée).
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
      userId ? uploadSwapFile(supabase, userId, file) : "",
    ]);
    setUploading(null);
    if (stored === null) {
      URL.revokeObjectURL(previewUrl);
      setError(t.generateErrors.swapUpload);
      return null;
    }
    return { path: stored, previewUrl, seconds, start: 0, file } satisfies SwapFile;
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

  async function pick(slot: "video" | "decor" | number, file: File | undefined) {
    const next = await upload(slot, slot === "video" ? "video" : "image", file);
    if (!next) return;
    if (slot === "video") {
      if (video) URL.revokeObjectURL(video.previewUrl);
      onVideo(next);
    } else if (slot === "decor") {
      if (decorPhoto) URL.revokeObjectURL(decorPhoto.previewUrl);
      onDecorPhoto?.(next);
    } else {
      const current = characters[slot]?.image;
      if (current) URL.revokeObjectURL(current.previewUrl);
      setCharacter(slot, { image: next });
    }
  }

  const tile = (slot: "video" | number) => {
    const kind = slot === "video" ? "video" : "image";
    const file = slot === "video" ? video : characters[slot]?.image;
    // Petites icônes rondes : la caméra pour le clip ; humain, animal et
    // créature pour le personnage. Le détail (formats, cadrage…) en infobulle.
    const icons: LucideIcon[] = kind === "video" ? [Video] : [UserRound, PawPrint, Ghost];
    const hint = kind === "video" ? fmt(t.studio.videoHint, { max: maxSeconds }) : t.studio.imageHint;
    return (
      <label
        key={slot}
        title={hint}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border text-center transition-colors ${
          file
            ? "border-line-strong bg-black bg-clip-padding"
            : "border-line bg-surface-2/40 px-4 hover:border-accent/50 hover:bg-surface-2"
        } ${compact ? "h-24" : "h-44"}`}
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
            {kind === "video" && Number.isFinite(file.seconds) && (
              <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-medium text-white tabular-nums">
                {clock(file.seconds!)}
              </span>
            )}
            <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              {t.studio.change}
            </span>
          </>
        ) : (
          <>
            <span className="flex -space-x-2.5 transition-transform duration-200 group-hover:-translate-y-0.5">
              {icons.map((Icon, i) => (
                <span
                  key={i}
                  className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-gradient-to-b from-surface-3 to-surface-2 text-text shadow-[inset_0_1px_0_var(--highlight)] ring-2 ring-surface"
                >
                  <Icon className="size-[1.125rem]" />
                </span>
              ))}
            </span>
            <span className="mt-2 text-sm leading-snug font-semibold text-balance">
              {kind === "video" ? t.studio.videoDrop : t.studio.imageDrop}
            </span>
            <span className="text-xs text-muted">
              {kind === "video"
                ? fmt(t.studio.videoDropSub, {
                    min: GENJUTSU_MIN_SECONDS.toLocaleString(INTL_LOCALES[locale]),
                    max: maxSeconds,
                  })
                : t.studio.imageDropSub}
            </span>
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
      <div className="grid gap-3">
        {tile("video")}
        {characters.map((_, i) => tile(i))}
      </div>
      {characters.length < maxCharacters && characters[0]?.image && (
        <button
          type="button"
          onClick={() => onCharacters((list) => [...list, { image: null, extras: [], target: "" }])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/60 hover:text-text"
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
                    className="relative size-12 overflow-hidden rounded-lg border border-line bg-black bg-clip-padding"
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
                    className="relative flex size-12 cursor-pointer items-center justify-center rounded-lg border border-line-strong text-muted transition-colors hover:border-accent/60 hover:text-text"
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
          <p className="text-xs text-faint">{decorTitle ?? t.studio.decorTitle}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <label
              title={t.studio.decorHint}
              className={`group relative flex h-20 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border transition-colors ${
                decorPhoto
                  ? "border-line bg-black bg-clip-padding"
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
            {decorPhoto && (
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
            )}
          </div>
        </div>
      )}
      {video && (video.seconds ?? 0) > maxSeconds + 0.5 && (
        <SegmentPicker
          video={video}
          maxSeconds={maxSeconds}
          onChange={(start) => onVideo({ ...video, start })}
        />
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {showInstructions && (
        <input
          value={instructions}
          onChange={(e) => onInstructions?.(e.target.value)}
          maxLength={500}
          placeholder={t.studio.instructionsPlaceholder}
          aria-label={t.studio.instructions}
          className="mt-3 w-full rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent/60 focus:bg-surface"
        />
      )}
    </div>
  );
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

// Clip trop long : le créateur choisit le passage de `maxSeconds` gardé, en
// faisant glisser une fenêtre sur la frise du clip (le curseur natif, masqué,
// sert au clavier).
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
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const frames = useFilmstrip(video.previewUrl, total);

  // La fenêtre se centre sous le doigt.
  const pick = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return;
    const at = ((clientX - box.left) / box.width) * total - maxSeconds / 2;
    onChange(Math.round(Math.min(Math.max(at, 0), max)));
  };

  return (
    <div className="mt-3">
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-muted">{fmt(t.studio.segment, { max: maxSeconds })}</span>
        <span className="text-faint tabular-nums">
          {clock(start)} → {clock(start + maxSeconds)} / {clock(total)}
        </span>
      </p>
      <div
        ref={track}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          pick(e.clientX);
        }}
        onPointerMove={(e) => dragging && pick(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className={`relative mt-2 h-12 touch-none overflow-hidden rounded-lg border border-line bg-surface-2 select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div className="flex h-full opacity-60">
          {frames.map((src, i) => (
            // Images tirées du clip local (blob:) : pas d'optimisation Next.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="h-full min-w-0 flex-1 object-cover" />
          ))}
        </div>
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-md border-2 border-accent bg-accent/15 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)] transition-[left] duration-75"
          style={{ left: `${(start / total) * 100}%`, width: `${(maxSeconds / total) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={start}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={fmt(t.studio.segment, { max: maxSeconds })}
          className="sr-only"
        />
      </div>
    </div>
  );
}

// Huit images réparties sur le clip, tirées localement pour la frise.
const FILMSTRIP_FRAMES = 8;
function useFilmstrip(url: string, total: number) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!Number.isFinite(total) || total <= 0) return;
    let cancelled = false;
    const el = document.createElement("video");
    el.muted = true;
    el.preload = "auto";
    el.src = url;
    const canvas = document.createElement("canvas");
    const seek = (time: number) =>
      new Promise<void>((resolve) => {
        el.onseeked = () => resolve();
        el.currentTime = time;
      });
    (async () => {
      await new Promise<void>((resolve) => {
        el.onloadeddata = () => resolve();
        el.onerror = () => resolve();
      });
      const shots: string[] = [];
      for (let i = 0; i < FILMSTRIP_FRAMES && !cancelled; i++) {
        await seek(((i + 0.5) / FILMSTRIP_FRAMES) * total);
        canvas.height = 96;
        canvas.width = Math.max(1, Math.round((el.videoWidth / Math.max(1, el.videoHeight)) * 96));
        canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
        shots.push(canvas.toDataURL("image/jpeg", 0.6));
      }
      if (!cancelled) setFrames(shots);
    })();
    return () => {
      cancelled = true;
      el.removeAttribute("src");
      el.load();
    };
  }, [url, total]);
  return frames;
}

function clock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
