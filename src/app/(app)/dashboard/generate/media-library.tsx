"use client";

import { Check, Film, Play, Upload, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playInline } from "@/app/inline-video";
import { fmt, plural } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { SWAP_INPUTS_BUCKET } from "@/lib/generation";
import { createClient } from "@/lib/supabase/client";
import G from "./library.module.css";

// Fichier déjà déposé par le créateur (swap-inputs), avec une URL signée.
export type LibraryItem = { path: string; url: string };

const RECENT = 23;
const ALL = 300;
const URL_TTL_SECONDS = 60 * 60;
const VIDEO_FILE = /\.(mp4|m4v|mov|qt|webm|mkv|avi|3gp|3g2|mts|m2ts|hevc)$/i;
const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

// Fenêtre posée sur la page : fond sombre, Échap et clic dehors la ferment,
// la page ne défile plus dessous.
export function Modal({
  label,
  onClose,
  className = "",
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-md sm:items-center sm:p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={label}
        className={`video-page flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/15 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.6)] sm:rounded-3xl ${className}`}
        style={{ background: "rgb(14 14 20 / 0.82)", backdropFilter: "blur(24px) saturate(1.2)", WebkitBackdropFilter: "blur(24px) saturate(1.2)" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalClose({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t.studio.close}
      title={t.studio.close}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white hover:text-black"
    >
      <X className="size-4" />
    </button>
  );
}

// Bibliothèque du créateur : tout ce qu'il a déjà déposé, à reprendre sans
// renvoyer le fichier. Vidéos : un clic choisit. Images : un clic si une
// seule est attendue, sinon plusieurs à cocher puis « Ajouter ».
export function MediaLibrary({
  userId,
  kind,
  max = 1,
  taken = [],
  onPick,
  onUpload,
  onClose,
}: {
  userId: string;
  kind: "video" | "image";
  // Images qu'on peut encore ajouter.
  max?: number;
  // Fichiers déjà dans le studio : affichés cochés, non reproposés.
  taken?: string[];
  onPick: (items: LibraryItem[]) => void;
  onUpload: (files: File[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const S = t.studio;
  const [supabase] = useState(createClient);
  const [scope, setScope] = useState<"recent" | "all">("recent");
  // null : chargement ; "error" : liste illisible.
  const [loaded, setLoaded] = useState<{ scope: string; items: LibraryItem[] | "error" } | null>(null);
  const [chosen, setChosen] = useState<LibraryItem[]>([]);
  const items = loaded?.scope === scope ? loaded.items : null;
  const several = kind === "image" && max > 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bucket = supabase.storage.from(SWAP_INPUTS_BUCKET);
      // Vidéos et images sont mêlées dans le dossier : on en lit assez pour
      // remplir la grille après tri.
      const { data, error } = await bucket.list(userId, {
        limit: scope === "recent" ? 200 : 1000,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (cancelled) return;
      if (error || !data) return setLoaded({ scope, items: "error" });
      const names = data
        .filter((o) => {
          // Sans identifiant : un sous-dossier (les passages découpés).
          if (!o.id) return false;
          const mime = String((o.metadata as { mimetype?: unknown } | null)?.mimetype ?? "");
          return kind === "video"
            ? mime.startsWith("video/") || VIDEO_FILE.test(o.name)
            : mime.startsWith("image/") || IMAGE_FILE.test(o.name);
        })
        .slice(0, scope === "recent" ? RECENT : ALL)
        .map((o) => `${userId}/${o.name}`);
      const { data: signed } = names.length
        ? await bucket.createSignedUrls(names, URL_TTL_SECONDS)
        : { data: [] };
      if (cancelled) return;
      setLoaded({
        scope,
        items: (signed ?? []).flatMap((s) => (s.path && s.signedUrl && !s.error ? [{ path: s.path, url: s.signedUrl }] : [])),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, kind, scope]);

  function choose(item: LibraryItem) {
    if (!several) return onPick([item]);
    setChosen((list) =>
      list.some((c) => c.path === item.path)
        ? list.filter((c) => c.path !== item.path)
        : list.length < max
          ? [...list, item]
          : list,
    );
  }

  return (
    <Modal label={S.libraryTitle} onClose={onClose} className="sm:max-w-4xl">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
        <h2 className="text-base font-semibold">{S.libraryTitle}</h2>
        <div role="tablist" className="rail ml-2 flex gap-1">
          {(["recent", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                scope === s ? "thumb text-text" : "text-muted hover:text-text"
              }`}
            >
              {s === "recent" ? S.libraryRecent : S.libraryAll}
            </button>
          ))}
        </div>
        <span className="ml-auto" />
        <ModalClose onClose={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-4 sm:px-5">
        <div className={G.grid}>
          <label className={G.upload}>
            <input
              type="file"
              accept={kind === "video" ? "video/*" : "image/*"}
              multiple={several}
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onUpload(files);
              }}
            />
            <span className={G.uploadIcon}>
              <Upload />
            </span>
            <span className="px-2 text-sm font-medium">{S.libraryUpload}</span>
          </label>

          {items === null &&
            Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={G.skeleton} />
            ))}

          {Array.isArray(items) &&
            items.map((item, index) => {
              const order = chosen.findIndex((c) => c.path === item.path);
              const inStudio = taken.includes(item.path);
              return (
                <Tile
                  key={item.path}
                  item={item}
                  index={index}
                  kind={kind}
                  selected={order >= 0 || inStudio}
                  badge={order >= 0 && several ? String(order + 1) : undefined}
                  disabled={inStudio || (several && order < 0 && chosen.length >= max)}
                  onChoose={() => choose(item)}
                />
              );
            })}
        </div>

        {items === "error" && <p className="py-10 text-center text-sm text-danger">{S.libraryError}</p>}
        {Array.isArray(items) && items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            {kind === "video" ? S.libraryEmptyVideo : S.libraryEmptyImage}
          </p>
        )}
      </div>

      {several && (
        <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
          <span className="text-xs text-muted">{fmt(S.imagesLimit, { max })}</span>
          <button
            type="button"
            disabled={!chosen.length}
            onClick={() => onPick(chosen)}
            className="btn btn-primary"
          >
            {fmt(plural(chosen.length, S.libraryAddOne, S.libraryAddMany), { n: chosen.length })}
          </button>
        </footer>
      )}
    </Modal>
  );
}

// Une vignette de la bibliothèque. Son fichier n'est chargé qu'une fois la
// vignette à l'écran ; une vidéo joue au survol.
// Inclinaison des cartes, un peu à gauche, un peu à droite.
const TILTS = [-2.5, 1.5, -1, 2.5, -1.5, 1];

function Tile({
  item,
  index,
  kind,
  selected,
  badge,
  disabled,
  onChoose,
}: {
  item: LibraryItem;
  index: number;
  kind: "video" | "image";
  selected: boolean;
  badge?: string;
  disabled: boolean;
  onChoose: () => void;
}) {
  const box = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [seen, setSeen] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={box}
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onChoose}
      onPointerEnter={(e) => e.pointerType === "mouse" && video.current && playInline(video.current)}
      onPointerLeave={() => video.current?.pause()}
      className={`${G.tile} ${selected ? G.selected : ""} ${disabled && !selected ? G.dimmed : ""}`}
      style={{ "--tilt": `${TILTS[index % TILTS.length]}deg` } as React.CSSProperties}
    >
      <span className={G.frame}>
        {seen &&
          (kind === "video" ? (
            broken ? (
              <span className={G.empty}>
                <Film />
              </span>
            ) : (
              <video
                ref={video}
                // #t : la première image sert de vignette, y compris sur iPhone.
                src={`${item.url}#t=0.1`}
                muted
                loop
                playsInline
                webkit-playsinline=""
                preload="metadata"
                disablePictureInPicture
                disableRemotePlayback
                onLoadedMetadata={(e) => setSeconds(e.currentTarget.duration)}
                onError={() => setBroken(true)}
              />
            )
          ) : (
            // URL signée Supabase : pas d'optimisation Next.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" loading="lazy" decoding="async" />
          ))}
      </span>
      {kind === "video" && !broken && (
        <span className={G.play}>
          <Play />
        </span>
      )}
      {kind === "video" && seconds !== null && Number.isFinite(seconds) && (
        <span className={G.time}>
          {Math.floor(seconds / 60)}:{String(Math.floor(seconds % 60)).padStart(2, "0")}
        </span>
      )}
      {selected && <span className={G.badge}>{badge ?? <Check />}</span>}
    </button>
  );
}
