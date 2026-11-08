"use client";

import { Maximize2, X } from "lucide-react";
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

// Début du passage gardé, ramené dans le clip : la durée gardée change avec
// le moteur, le début choisi reste tel quel dans l'état.
export function clampedStart(file: SwapFile, maxSeconds: number) {
  const start = file.start ?? 0;
  return Number.isFinite(file.seconds)
    ? Math.min(start, Math.max(0, Math.floor(file.seconds! - maxSeconds)))
    : start;
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
}) {
  const [supabase] = useState(createClient);
  const { t, locale } = useI18n();
  const [uploading, setUploading] = useState<"video" | "images" | "decor" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = images.length < maxImages;

  // Dépose un fichier dans swap-inputs (ou le garde dans le navigateur pour
  // un visiteur) ; null si refusé ou raté (erreur affichée). Toute vidéo et
  // toute image sont prises telles quelles ; seules les photos dans un format
  // que Genjutsu ne lit pas (HEIC d'iPhone…) sont converties en JPEG.
  async function upload(kind: "video" | "image", picked: File) {
    const file = kind === "image" ? await toSupportedImage(picked) : picked;
    if (!file || !isAccepted(kind, file)) return (setError(t.generateErrors.swapFormat), null);
    if (file.size > SWAP_MAX_BYTES) return (setError(t.generateErrors.swapTooBig), null);
    const previewUrl = URL.createObjectURL(file);
    const [seconds, stored] = await Promise.all([
      kind === "video" ? readDuration(previewUrl) : undefined,
      userId ? uploadSwapFile(supabase, userId, file) : "",
    ]);
    if (stored === null) {
      URL.revokeObjectURL(previewUrl);
      setError(t.generateErrors.swapUpload);
      return null;
    }
    return { path: stored, previewUrl, seconds, start: 0, file } satisfies SwapFile;
  }

  async function pickVideo(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading("video");
    const next = await upload("video", file);
    setUploading(null);
    if (!next) return;
    if (video) URL.revokeObjectURL(video.previewUrl);
    onVideo(next);
  }

  async function pickDecor(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading("decor");
    const next = await upload("image", file);
    setUploading(null);
    if (!next) return;
    if (decorPhoto) URL.revokeObjectURL(decorPhoto.previewUrl);
    onDecorPhoto?.(next);
  }

  // Plusieurs images d'un coup, dans la limite des places restantes.
  async function addImages(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, maxImages - images.length);
    if (!list.length) return;
    setError(null);
    setUploading("images");
    for (const file of list) {
      const next = await upload("image", file);
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
      <div className="rounded-2xl bg-surface-2/60">
        {video ? (
          <VideoCard
            file={video}
            maxSeconds={maxSeconds}
            removeLabel={t.studio.removeVideo}
            expandLabel={t.studio.expandVideo}
            onRemove={() => {
              URL.revokeObjectURL(video.previewUrl);
              onVideo(null);
            }}
          />
        ) : (
          <label
            title={fmt(t.studio.videoHint, { max: maxSeconds })}
            className="group relative flex aspect-video cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line px-4 text-center transition-colors hover:border-accent/50 hover:bg-surface-2"
          >
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              disabled={uploading !== null}
              onChange={(e) => {
                pickVideo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
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
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-sm text-white">
                {t.studio.uploading}
              </span>
            )}
          </label>
        )}
        {/* Clip plus long que ce que lit le moteur : il part entier, Genjutsu
            n'en garde que le début. */}
        {video && (video.seconds ?? 0) > maxSeconds + 0.5 && (
          <p className="px-4 pb-4 text-xs text-muted">
            {fmt(t.studio.firstSecondsOnly, { seconds: Math.round(video.seconds!), max: maxSeconds })}
          </p>
        )}
      </div>

      {/* Les images : une tuile « + », puis chaque image, citée @image1… */}
      <div className="rounded-2xl bg-surface-2/60 px-4 py-8">
        {/* Aucune image : le trio personnage · tenue · objet invite à en
            ajouter ; ensuite, une tuile « + » en tête de la rangée. Le prompt
            dit ce que chaque image remplace. */}
        {!images.length ? (
          <label
            title={`${t.studio.addImages} · ${fmt(t.studio.imagesLimit, { max: maxImages })}`}
            className="group flex cursor-pointer flex-col items-center text-center"
          >
            <input
              type="file"
              multiple
              accept="image/*"
              className="sr-only"
              aria-label={t.studio.addImages}
              disabled={uploading !== null}
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = "";
              }}
            />
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
          </label>
        ) : (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {canAdd && (
            <label
              title={`${t.studio.addImages} · ${fmt(t.studio.imagesLimit, { max: maxImages })}`}
              className="group relative flex size-24 cursor-pointer items-center justify-center rounded-[1.25rem] bg-surface-3 transition-colors hover:bg-surface-3/70"
            >
              <input
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                aria-label={t.studio.addImages}
                disabled={uploading !== null}
                onChange={(e) => {
                  addImages(e.target.files);
                  e.target.value = "";
                }}
              />
              {uploading === "images" ? (
                <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
              ) : (
                <GlassBubble className="size-10 group-hover:scale-105">
                  <PlusGlyph className="size-4.5" />
                </GlassBubble>
              )}
            </label>
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
        <div className="rounded-2xl bg-surface-2/60">
          {decorPhoto ? (
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black bg-clip-padding">
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
            <label className="group relative flex aspect-[16/7] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line px-4 text-center transition-colors hover:border-accent/50 hover:bg-surface-2">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={t.studio.decorImage}
                disabled={uploading !== null}
                onChange={(e) => {
                  pickDecor(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <GlassBubble className="size-14 group-hover:scale-105">
                <MountainGlyph className="size-6" />
              </GlassBubble>
              <span className="mt-2.5 text-sm leading-snug font-medium">{t.studio.decorDrop}</span>
              <span className="mt-0.5 text-xs text-muted">{t.studio.decorDropSub}</span>
              {uploading === "decor" && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-sm text-white">
                  {t.studio.uploading}
                </span>
              )}
            </label>
          )}
        </div>
      )}

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
    </div>
  );
}

// Le clip déposé : carte légèrement penchée, à la proportion du clip, en
// boucle sur le passage gardé. Bouton d'agrandissement au centre, « × » au coin.
function VideoCard({
  file,
  maxSeconds,
  onRemove,
  removeLabel,
  expandLabel,
}: {
  file: SwapFile;
  maxSeconds: number;
  onRemove: () => void;
  removeLabel: string;
  expandLabel: string;
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
            {clock(file.seconds!)}
          </span>
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
  const start = clampedStart(file, maxSeconds);
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
        if (el.currentTime < start - 0.3 || el.currentTime >= start + maxSeconds) {
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
    <div className="overflow-visible rounded-2xl bg-surface-2/60">
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
