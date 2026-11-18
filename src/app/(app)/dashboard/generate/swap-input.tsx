"use client";

import { Maximize2, Scissors, X } from "lucide-react";
import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { playInline } from "@/app/inline-video";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  GENJUTSU_MIN_SECONDS,
  SWAP_IMAGE_TYPES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_BYTES,
} from "@/lib/generation";
import { createClient } from "@/lib/supabase/client";
import { CameraGlyph, CubeGlyph, GlassBubble, HeadGlyph, MountainGlyph, PlusGlyph, ShirtGlyph } from "./bubble-icons";
import { MediaLibrary, type LibraryItem } from "./media-library";
import { TrimDialog } from "./trim-dialog";

type Supabase = ReturnType<typeof createClient>;

// Fichier déposé dans swap-inputs. `seconds` : durée lue par le navigateur,
// pour afficher le coût (le serveur la remesure) ; NaN s'il ne sait pas la
// lire (certains .mov). `start` et `length` : passage gardé, choisi dans la
// fenêtre de découpe et coupé par le serveur au lancement ; sans `length`,
// le clip part entier. `path` vide : visiteur sans compte, le fichier reste
// dans le navigateur (`file`) jusqu'à sa connexion. Sans `file` : fichier
// repris de la bibliothèque, `previewUrl` est alors une URL signée.
export type SwapFile = {
  path: string;
  previewUrl: string;
  seconds?: number;
  start?: number;
  length?: number;
  file?: File;
};

// Envoie un fichier dans swap-inputs, sous le dossier de l'utilisateur ;
// null si l'envoi échoue.
export async function uploadSwapFile(supabase: Supabase, userId: string, file: File) {
  const path = `${userId}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
  // Vidéo sans type déclaré (certains téléphones) : déduit de l'extension.
  const contentType =
    file.type || (/\.(mov|qt)$/i.test(file.name) ? "video/quicktime" : /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4");
  const { error } = await supabase.storage.from(SWAP_INPUTS_BUCKET).upload(path, file, { contentType });
  return error ? null : path;
}

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|qt|webm|mkv|avi|3gp|3g2|mts|m2ts|hevc)$/i;

// Vidéo : tout type video/*, ou un fichier sans type (certains téléphones)
// qui porte une extension de vidéo. Image : les formats que Genjutsu lit.
function isAccepted(kind: "video" | "image", file: File) {
  if (kind === "image") return SWAP_IMAGE_TYPES.includes(file.type);
  return file.type.startsWith("video/") || (!file.type && VIDEO_EXTENSIONS.test(file.name));
}

// Photo dans un autre format (HEIC, AVIF, GIF…) : redessinée en JPEG par le
// navigateur. null si le navigateur ne sait pas la lire.
async function toSupportedImage(file: File): Promise<File | null> {
  if (SWAP_IMAGE_TYPES.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return null;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  }
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

// Durée gardée : le passage choisi, borné par ce que lit le moteur et par la
// fin du clip. Durée du clip inconnue et rien de choisi : celle du moteur.
export function keptSeconds(file: SwapFile, maxSeconds: number) {
  const rest = Number.isFinite(file.seconds) ? file.seconds! - (file.start ?? 0) : Infinity;
  return Math.min(maxSeconds, file.length ?? Infinity, rest);
}

// Zone de dépôt : avec un compte, elle ouvre la bibliothèque (où déposer un
// nouveau fichier reste le premier choix) ; sans compte, le sélecteur de
// fichiers du navigateur.
function DropZone({
  library,
  onOpen,
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  label,
  title,
  className,
  children,
}: {
  library: boolean;
  onOpen: () => void;
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  title?: string;
  className: string;
  children: React.ReactNode;
}) {
  if (library) {
    return (
      <button type="button" onClick={onOpen} disabled={disabled} aria-label={label} title={title} className={className}>
        {children}
      </button>
    );
  }
  return (
    <label title={title} className={`cursor-pointer ${className}`}>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      {children}
    </label>
  );
}

// Nom d'une image dans le prompt : @image1, @image2…
export const imageTag = (index: number) => `@image${index + 1}`;

// Zone de saisie du studio : le clip filmé à reprendre, les images (en vrac,
// citées dans le prompt par @image1, @image2…) et un seul prompt qui dit ce
// que le créateur veut. Le serveur en tire qui remplace qui (planSwapCast).
export function SwapInput({
  userId,
  video,
  onVideo,
  images,
  onImages,
  maxImages,
  maxSeconds,
  decorPhoto = null,
  onDecorPhoto,
  showDecor = false,
  prompt,
  onPrompt,
  presetPeople,
  canTrim = true,
  children,
}: {
  // null : visiteur sans compte, rien n'est envoyé avant sa connexion.
  userId: string | null;
  video: SwapFile | null;
  onVideo: (file: SwapFile | null) => void;
  images: SwapFile[];
  onImages: Dispatch<SetStateAction<SwapFile[]>>;
  maxImages: number;
  // Durée gardée au plus, selon le moteur choisi.
  maxSeconds: number;
  // Changement de décor : photo du lieu. Sans photo, le décor du clip est gardé.
  decorPhoto?: SwapFile | null;
  onDecorPhoto?: (file: SwapFile | null) => void;
  showDecor?: boolean;
  prompt: string;
  onPrompt: (text: string) => void;
  // Plan prêt : qui chaque image remplace, déjà fixé (un libellé par image,
  // dans la langue du site).
  presetPeople?: string[];
  // Faux pour un plan prêt : son passage est fixé.
  canTrim?: boolean;
  children?: React.ReactNode;
}) {
  const [supabase] = useState(createClient);
  const { t, locale } = useI18n();
  const [uploading, setUploading] = useState<"video" | "images" | "decor" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = images.length < maxImages;
  // Bibliothèque ouverte, et pour quelle case.
  const [library, setLibrary] = useState<"video" | "images" | "decor" | null>(null);
  // Fenêtre de découpe : le clip à découper et, s'il vient d'être déposé,
  // son envoi encore en cours.
  const [trim, setTrim] = useState<{ file: SwapFile; stored?: Promise<string | null> } | null>(null);
  const [placing, setPlacing] = useState(false);
  const hasLibrary = Boolean(userId);
  const minSeconds = GENJUTSU_MIN_SECONDS;
  const trimmable = (seconds: number | undefined) =>
    canTrim && Number.isFinite(seconds) && seconds! > minSeconds + 0.3;

  // Fichier accepté ; null si refusé (erreur affichée). Toute vidéo et toute
  // image sont prises telles quelles ; seules les photos dans un format que
  // Genjutsu ne lit pas (HEIC d'iPhone…) sont converties en JPEG.
  async function check(kind: "video" | "image", picked: File) {
    const file = kind === "image" ? await toSupportedImage(picked) : picked;
    if (!file || !isAccepted(kind, file)) return (setError(t.generateErrors.swapFormat), null);
    if (file.size > SWAP_MAX_BYTES) return (setError(t.generateErrors.swapTooBig), null);
    return file;
  }

  // Dépôt dans swap-inputs ; un visiteur garde le fichier dans son navigateur.
  const store = (file: File) => (userId ? uploadSwapFile(supabase, userId, file) : Promise.resolve(""));

  async function upload(picked: File) {
    const file = await check("image", picked);
    if (!file) return null;
    const previewUrl = URL.createObjectURL(file);
    const stored = await store(file);
    if (stored === null) {
      URL.revokeObjectURL(previewUrl);
      setError(t.generateErrors.swapUpload);
      return null;
    }
    return { path: stored, previewUrl, start: 0, file } satisfies SwapFile;
  }

  // Le clip entre dans le studio, une fois son envoi fini. `cut` : passage
  // choisi dans la fenêtre de découpe ; absent, le clip part entier.
  async function place(file: SwapFile, stored?: Promise<string | null>, cut?: { start: number; length: number }) {
    setPlacing(true);
    const path = stored ? await stored : file.path;
    setPlacing(false);
    setUploading(null);
    setTrim(null);
    if (path === null) {
      URL.revokeObjectURL(file.previewUrl);
      setError(t.generateErrors.swapUpload);
      return;
    }
    if (video && video.previewUrl !== file.previewUrl) URL.revokeObjectURL(video.previewUrl);
    onVideo({ ...file, path, start: cut?.start ?? 0, length: cut?.length });
  }

  // Clip déposé : la fenêtre de découpe s'ouvre aussitôt sur l'aperçu local,
  // l'envoi continue derrière.
  async function pickVideo(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    const file = await check("video", picked);
    if (!file) return;
    setUploading("video");
    const previewUrl = URL.createObjectURL(file);
    const stored = store(file);
    const seconds = await readDuration(previewUrl);
    const next: SwapFile = { path: "", previewUrl, seconds, start: 0, file };
    if (trimmable(seconds)) setTrim({ file: next, stored });
    else await place(next, stored);
  }

  // Clip repris de la bibliothèque : déjà déposé, il ne manque que sa durée.
  async function pickLibraryVideo(item: LibraryItem) {
    setError(null);
    setUploading("video");
    const seconds = await readDuration(item.url);
    const next: SwapFile = { path: item.path, previewUrl: item.url, seconds, start: 0 };
    if (trimmable(seconds)) {
      setUploading(null);
      setTrim({ file: next });
    } else await place(next);
  }

  // Fenêtre fermée sans choisir : un clip tout juste déposé n'entre pas dans
  // le studio (il reste dans la bibliothèque), le clip déjà en place ne change pas.
  function closeTrim() {
    if (trim && trim.file.previewUrl !== video?.previewUrl) URL.revokeObjectURL(trim.file.previewUrl);
    setTrim(null);
    setUploading(null);
  }

  async function pickDecor(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading("decor");
    const next = await upload(file);
    setUploading(null);
    if (!next) return;
    if (decorPhoto) URL.revokeObjectURL(decorPhoto.previewUrl);
    onDecorPhoto?.(next);
  }

  // Fichiers repris de la bibliothèque ou déposés depuis elle.
  function fromLibrary(items: LibraryItem[]) {
    const slot = library;
    setLibrary(null);
    if (slot === "video") void pickLibraryVideo(items[0]);
    else if (slot === "decor") onDecorPhoto?.({ path: items[0].path, previewUrl: items[0].url });
    else {
      onImages((current) =>
        [
          ...current,
          ...items
            .filter((item) => !current.some((c) => c.path === item.path))
            .map((item) => ({ path: item.path, previewUrl: item.url })),
        ].slice(0, maxImages),
      );
    }
  }

  function uploadFromLibrary(files: File[]) {
    const slot = library;
    setLibrary(null);
    if (slot === "video") void pickVideo(files[0]);
    else if (slot === "decor") void pickDecor(files[0]);
    else void addImages(files);
  }

  // Plusieurs images d'un coup, dans la limite des places restantes.
  async function addImages(files: File[]) {
    const list = files.slice(0, maxImages - images.length);
    if (!list.length) return;
    setError(null);
    setUploading("images");
    for (const file of list) {
      const next = await upload(file);
      if (next) onImages((current) => (current.length < maxImages ? [...current, next] : current));
    }
    setUploading(null);
  }

  // Les images suivantes prennent un numéro de moins : le prompt suit, et la
  // mention de l'image retirée disparaît.
  function removeImage(index: number) {
    URL.revokeObjectURL(images[index].previewUrl);
    onImages((current) => current.filter((_, i) => i !== index));
    const removed = index + 1;
    onPrompt(
      prompt.replace(/@image(\d+)\b/gi, (tag, n) => {
        const k = Number(n);
        return k === removed ? "" : k > removed ? imageTag(k - 2) : tag;
      }),
    );
  }

  return (
    <div className="space-y-3 px-4 pt-4 pb-2">
      {/* Le clip : carte penchée une fois déposé. */}
      <div className="rounded-[1.25rem] bg-surface-2/60">
        {video ? (
          <VideoCard
            file={video}
            maxSeconds={maxSeconds}
            removeLabel={t.studio.removeVideo}
            expandLabel={t.studio.expandVideo}
            trimLabel={t.studio.trimButton}
            onTrim={trimmable(video.seconds) ? () => setTrim({ file: video }) : undefined}
            onRemove={() => {
              URL.revokeObjectURL(video.previewUrl);
              onVideo(null);
            }}
          />
        ) : (
          <DropZone
            library={hasLibrary}
            onOpen={() => setLibrary("video")}
            onFiles={(files) => pickVideo(files[0])}
            accept="video/*"
            disabled={uploading !== null}
            title={fmt(t.studio.videoHint, { max: maxSeconds })}
            className="group relative flex aspect-video w-full flex-col items-center justify-center rounded-[1.25rem] px-4 text-center transition-colors hover:bg-surface-2"
          >
            <GlassBubble className="size-16 group-hover:scale-105">
              <CameraGlyph className="size-7" />
            </GlassBubble>
            <span className="mt-3 text-sm leading-snug font-medium">{t.studio.videoDrop}</span>
            <span className="mt-0.5 text-xs text-muted">
              {fmt(t.studio.videoDropSub, {
                min: GENJUTSU_MIN_SECONDS.toLocaleString(INTL_LOCALES[locale]),
                max: maxSeconds,
              })}
            </span>
            {uploading === "video" && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[1.25rem] bg-black/60 text-sm text-white">
                {t.studio.uploading}
              </span>
            )}
          </DropZone>
        )}
        {/* Clip plus long que ce que lit le moteur, sans passage choisi : il
            part entier, Genjutsu n'en garde que le début. */}
        {video && video.length === undefined && (video.seconds ?? 0) > maxSeconds + 0.5 && (
          <p className="px-4 pb-4 text-xs text-muted">
            {fmt(t.studio.firstSecondsOnly, { seconds: Math.round(video.seconds!), max: maxSeconds })}
          </p>
        )}
      </div>

      {/* Les images : une tuile « + », puis chaque image, citée @image1… */}
      <div className="rounded-[1.25rem] bg-surface-2/60 px-4 py-8">
        {/* Aucune image : le trio personnage · tenue · objet invite à en
            ajouter ; ensuite, une tuile « + » en tête de la rangée. Le prompt
            dit ce que chaque image remplace. */}
        {!images.length ? (
          <DropZone
            library={hasLibrary}
            onOpen={() => setLibrary("images")}
            onFiles={addImages}
            accept="image/*"
            multiple
            disabled={uploading !== null}
            label={t.studio.addImages}
            title={`${t.studio.addImages} · ${fmt(t.studio.imagesLimit, { max: maxImages })}`}
            className="group flex w-full flex-col items-center text-center"
          >
            {uploading === "images" ? (
              <span className="flex h-16 items-center">
                <span className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
              </span>
            ) : (
              <span className="flex -space-x-2 transition-transform duration-200 group-hover:scale-[1.03]">
                <GlassBubble className="size-16">
                  <HeadGlyph className="size-7" />
                </GlassBubble>
                <GlassBubble className="size-16">
                  <ShirtGlyph className="size-7" />
                </GlassBubble>
                <GlassBubble className="size-16">
                  <CubeGlyph className="size-7" />
                </GlassBubble>
              </span>
            )}
            <span className="mt-3 text-xs text-muted">
              {t.studio.imageDrop} · {t.studio.imageDropSub}
            </span>
          </DropZone>
        ) : (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {canAdd && (
            <DropZone
              library={hasLibrary}
              onOpen={() => setLibrary("images")}
              onFiles={addImages}
              accept="image/*"
              multiple
              disabled={uploading !== null}
              label={t.studio.addImages}
              title={`${t.studio.addImages} · ${fmt(t.studio.imagesLimit, { max: maxImages })}`}
              className="group relative flex size-24 items-center justify-center rounded-[1.25rem] bg-surface-3 transition-colors hover:bg-surface-3/70"
            >
              {uploading === "images" ? (
                <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
              ) : (
                <GlassBubble className="size-10 group-hover:scale-105">
                  <PlusGlyph className="size-4.5" />
                </GlassBubble>
              )}
            </DropZone>
          )}
          {images.map((f, i) => (
            <div
              key={f.previewUrl}
              title={imageTag(i)}
              className="group relative size-24 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black bg-clip-padding"
            >
              {/* Aperçu local (blob:) : pas d'optimisation Next. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.previewUrl} alt={imageTag(i)} className="size-full object-cover" />
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
                {imageTag(i)}
              </span>
              <button
                type="button"
                aria-label={t.studio.removePhoto}
                title={t.studio.removePhoto}
                onClick={() => removeImage(i)}
                className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        )}
        {presetPeople && (
          <ul className="mt-4 space-y-1 text-center text-xs text-muted">
            {presetPeople.map((label, i) => (
              <li key={i}>
                <span className="font-medium text-text">{imageTag(i)}</span> · {fmt(t.studio.presetTarget, { who: label })}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Le nouveau lieu : même dépôt que le clip, puis la photo en grand. */}
      {showDecor && (
        <div className="rounded-[1.25rem] bg-surface-2/60">
          {decorPhoto ? (
            <div className="relative aspect-video overflow-hidden rounded-[1.25rem] bg-black">
              {/* Aperçu local (blob:) : pas d'optimisation Next. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={decorPhoto.previewUrl} alt={t.studio.decorImage} className="size-full object-cover" />
              <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">
                {t.studio.decorRequiredTitle}
              </span>
              <button
                type="button"
                aria-label={t.studio.removePhoto}
                title={t.studio.removePhoto}
                onClick={() => {
                  URL.revokeObjectURL(decorPhoto.previewUrl);
                  onDecorPhoto?.(null);
                }}
                className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-danger"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <DropZone
              library={hasLibrary}
              onOpen={() => setLibrary("decor")}
              onFiles={(files) => pickDecor(files[0])}
              accept="image/*"
              disabled={uploading !== null}
              label={t.studio.decorImage}
              className="group relative flex aspect-[16/7] w-full flex-col items-center justify-center rounded-[1.25rem] px-4 text-center transition-colors hover:bg-surface-2"
            >
              <GlassBubble className="size-14 group-hover:scale-105">
                <MountainGlyph className="size-6" />
              </GlassBubble>
              <span className="mt-2.5 text-sm leading-snug font-medium">{t.studio.decorDrop}</span>
              <span className="mt-0.5 text-xs text-muted">{t.studio.decorDropSub}</span>
              {uploading === "decor" && (
                <span className="absolute inset-0 flex items-center justify-center rounded-[1.25rem] bg-black/60 text-sm text-white">
                  {t.studio.uploading}
                </span>
              )}
            </DropZone>
          )}
        </div>
      )}

      {children}

      {error && <p className="text-xs text-danger">{error}</p>}

      <PromptBox
        label={t.studio.instructions}
        value={prompt}
        onChange={onPrompt}
        placeholder={t.studio.instructionsPlaceholder}
        images={images}
        hasVideo={Boolean(video)}
      />
      <p className="px-1 text-xs text-muted">{t.studio.promptHint}</p>

      {library && userId && (
        <MediaLibrary
          userId={userId}
          kind={library === "video" ? "video" : "image"}
          max={library === "images" ? maxImages - images.length : 1}
          taken={library === "images" ? images.map((f) => f.path) : []}
          onPick={fromLibrary}
          onUpload={uploadFromLibrary}
          onClose={() => setLibrary(null)}
        />
      )}
      {trim && (
        <TrimDialog
          src={trim.file.previewUrl}
          duration={trim.file.seconds!}
          initial={{ start: trim.file.start ?? 0, length: trim.file.length }}
          minSeconds={minSeconds}
          maxSeconds={maxSeconds}
          busy={placing}
          onConfirm={(start, length) => place(trim.file, trim.stored, { start, length })}
          onSkip={() => place(trim.file, trim.stored)}
          onClose={closeTrim}
        />
      )}
    </div>
  );
}

// Le clip déposé : carte légèrement penchée, à la proportion du clip, en
// boucle sur le passage gardé. Bouton d'agrandissement au centre, « × » au coin.
function VideoCard({
  file,
  maxSeconds,
  onRemove,
  onTrim,
  removeLabel,
  expandLabel,
  trimLabel,
}: {
  file: SwapFile;
  maxSeconds: number;
  onRemove: () => void;
  // Rouvre la fenêtre de découpe ; absent quand il n'y a rien à découper.
  onTrim?: () => void;
  removeLabel: string;
  expandLabel: string;
  trimLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ratio, setRatio] = useState(16 / 9);

  function expand() {
    const el = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.());
    else el.webkitEnterFullscreen?.();
  }

  return (
    <div className="flex justify-center px-6 pt-7 pb-6">
      <div
        className="relative max-w-full -rotate-3"
        style={{ width: `min(100%, ${17 * ratio}rem)`, aspectRatio: String(ratio) }}
      >
        <div className="size-full overflow-hidden rounded-2xl border-2 border-white/85 bg-black shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)]">
          <SegmentPreview file={file} maxSeconds={maxSeconds} videoRef={ref} onRatio={setRatio} />
        </div>
        <button
          type="button"
          aria-label={expandLabel}
          title={expandLabel}
          onClick={expand}
          className="absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
        >
          <Maximize2 className="size-4" />
        </button>
        {Number.isFinite(file.seconds) && (
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-medium text-white tabular-nums">
            {file.length === undefined
              ? clock(file.seconds!)
              : `${clock(file.start ?? 0)} – ${clock((file.start ?? 0) + keptSeconds(file, maxSeconds))}`}
          </span>
        )}
        {onTrim && (
          <button
            type="button"
            aria-label={trimLabel}
            title={trimLabel}
            onClick={onTrim}
            className="absolute right-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-accent"
          >
            <Scissors className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          className="absolute -top-3 -right-3 flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-text shadow-md transition-colors hover:bg-danger hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

// Aperçu du clip, en boucle sur le passage gardé.
function SegmentPreview({
  file,
  maxSeconds,
  videoRef,
  onRatio,
}: {
  file: SwapFile;
  maxSeconds: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onRatio: (ratio: number) => void;
}) {
  const start = file.start ?? 0;
  const end = start + keptSeconds(file, maxSeconds);
  return (
    <video
      ref={videoRef}
      src={file.previewUrl}
      muted
      autoPlay
      playsInline
      webkit-playsinline=""
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        el.currentTime = start;
        if (el.videoWidth && el.videoHeight) onRatio(el.videoWidth / el.videoHeight);
      }}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        if (el.currentTime < start - 0.3 || el.currentTime >= end) {
          el.currentTime = start;
          playInline(el);
        }
      }}
      onEnded={(e) => {
        e.currentTarget.currentTime = start;
        playInline(e.currentTarget);
      }}
      className="size-full object-cover"
    />
  );
}

// Le prompt unique. Taper « @ » propose les images déposées (et le clip) :
// un clic ou Entrée insère @image1, @image2… Désactivé, le prompt est vidé
// et l'IA décide seule qui remplacer.
function PromptBox({
  label,
  value,
  onChange,
  placeholder,
  images,
  hasVideo,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  images: SwapFile[];
  hasVideo: boolean;
}) {
  const [open, setOpen] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);
  // Mot « @… » en cours de frappe juste avant le curseur, et sa position.
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null);
  const [active, setActive] = useState(0);

  const options = [
    ...images.map((f, i) => ({ tag: imageTag(i), preview: f.previewUrl })),
    ...(hasVideo ? [{ tag: "@video", preview: null }] : []),
  ].filter((o) => mention && o.tag.slice(1).toLowerCase().startsWith(mention.query.toLowerCase()));

  function track(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart);
    const match = /(^|\s)@(\w*)$/.exec(before);
    setMention(match ? { query: match[2], at: before.length - match[2].length - 1 } : null);
    setActive(0);
  }

  function insert(tag: string) {
    const el = area.current;
    if (!el || !mention) return;
    const end = mention.at + 1 + mention.query.length;
    const next = `${value.slice(0, mention.at)}${tag} ${value.slice(end)}`;
    onChange(next);
    setMention(null);
    const caret = mention.at + tag.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="overflow-visible rounded-[1.25rem] bg-surface-2/60">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) onChange("");
        }}
        aria-pressed={open}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3.5 ${open ? "border-b border-line" : ""}`}
      >
        <span className="text-base font-semibold">{label}</span>
        <span
          aria-hidden
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            open ? "bg-accent" : "bg-surface-3"
          }`}
        >
          <span
            className={`inline-block size-4.5 rounded-full bg-white shadow-sm transition-transform ${
              open ? "translate-x-[1.375rem]" : "translate-x-[0.1875rem]"
            }`}
          />
        </span>
      </button>
      {open && (
        <div className="relative">
          <textarea
            ref={area}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              track(e.target);
            }}
            onClick={(e) => track(e.currentTarget)}
            onKeyUp={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") track(e.currentTarget);
            }}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            onKeyDown={(e) => {
              if (!mention || !options.length) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insert(options[Math.min(active, options.length - 1)].tag);
              } else if (e.key === "Escape") {
                setMention(null);
              }
            }}
            maxLength={1000}
            rows={4}
            placeholder={placeholder}
            className="block w-full resize-none bg-transparent px-4 py-3 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint"
          />
          {mention && options.length > 0 && (
            <ul
              role="listbox"
              className="absolute bottom-full left-3 z-20 mb-1 max-h-60 w-52 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg"
            >
              {options.map((o, i) => (
                <li key={o.tag} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(o.tag)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm ${
                      i === active ? "bg-surface-2" : "hover:bg-surface-2"
                    }`}
                  >
                    {o.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.preview} alt="" className="size-7 rounded-md object-cover" />
                    ) : (
                      <GlassBubble className="size-7">
                        <CameraGlyph className="size-3.5" />
                      </GlassBubble>
                    )}
                    {o.tag}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function clock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
