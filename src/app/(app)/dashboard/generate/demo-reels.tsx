"use client";

import { ChevronDown, ChevronUp, Loader2, Play, Repeat2, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inlinePlaybackBlocked } from "@/app/inline-video";
import { useI18n } from "@/i18n/provider";
import type { DemoClip } from "./demo-clips";

const ROUND_BUTTON =
  "flex size-11 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 disabled:opacity-35";

// Fil de démos façon reels, en plein écran : une vidéo par écran, qui joue
// seule tant qu'elle est là. Seules la vidéo affichée et ses voisines sont
// montées, le reste du fil ne pèse rien. Au clavier : flèches, M et Échap.
export function DemoReels({
  clips,
  start,
  onClose,
  onRecreate,
}: {
  clips: DemoClip[];
  start: number;
  onClose: () => void;
  // Faux si le clip n'a pas pu être repris.
  onRecreate: (clip: DemoClip) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const E = t.studio.examples;
  const feed = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<number, HTMLVideoElement>());
  const [active, setActive] = useState(start);
  const [muted, setMuted] = useState(false);
  // Lecture en page interdite (voir inline-video) : chaque vidéo attend un toucher.
  const [blocked] = useState(inlinePlaybackBlocked);
  // Vidéo mise en pause, et démo qui n'a pas pu être reprise.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [recreating, setRecreating] = useState(false);
  const clip = clips[active];
  const paused = blocked || pausedAt === active;

  const scrollToClip = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    feed.current?.children[index]?.scrollIntoView({ behavior, block: "start" });
  }, []);

  // La page derrière ne défile plus, et le fil s'ouvre sur la démo touchée.
  useLayoutEffect(() => {
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    scrollToClip(start, "instant");
    feed.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = overflow;
    };
  }, [start, scrollToClip]);

  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    [...root.children].forEach((slide) => seen.observe(slide));
    return () => seen.disconnect();
  }, []);

  // Sans geste récent, certains navigateurs refusent le son : la vidéo repart
  // muette plutôt que de rester à l'arrêt.
  const play = useCallback((video: HTMLVideoElement) => {
    video.play().catch((error: DOMException) => {
      if (error.name !== "NotAllowedError" || video.muted) return;
      video.muted = true;
      setMuted(true);
      video.play().catch(() => {});
    });
  }, []);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (index !== active) {
        video.pause();
        video.currentTime = 0;
      }
    });
    const video = videos.current.get(active);
    if (!video) return;
    video.muted = muted;
    if (!blocked) play(video);
  }, [active, muted, blocked, play]);

  const go = useCallback(
    (step: number) => scrollToClip(Math.min(Math.max(active + step, 0), clips.length - 1)),
    [active, clips.length, scrollToClip],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") go(1);
      else if (e.key === "ArrowUp") go(-1);
      else if (e.key.toLowerCase() === "m") setMuted((m) => !m);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  function togglePlay(video: HTMLVideoElement) {
    if (video.paused) play(video);
    else video.pause();
  }

  async function recreate() {
    setRecreating(true);
    setFailedAt(null);
    const ok = await onRecreate(clip);
    setRecreating(false);
    if (ok) onClose();
    else setFailedAt(active);
  }

  return createPortal(
    <div role="dialog" aria-modal aria-label={E.watch} className="fixed inset-0 z-50 bg-black">
      <div
        ref={feed}
        tabIndex={-1}
        className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {clips.map(({ base, ratio }, i) => {
          const near = Math.abs(i - active) <= 1;
          return (
            <section
              key={base}
              data-index={i}
              className="relative flex h-dvh snap-start snap-always items-center justify-center overflow-hidden lg:py-4"
            >
              {near && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${base}.jpg`} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-2xl" />
              )}
              {near ? (
                <video
                  ref={(video) => {
                    if (video) videos.current.set(i, video);
                    else videos.current.delete(i);
                  }}
                  src={`${base}.mp4`}
                  poster={`${base}.jpg`}
                  muted
                  loop
                  playsInline
                  webkit-playsinline=""
                  disablePictureInPicture
                  disableRemotePlayback
                  preload="auto"
                  onClick={(e) => togglePlay(e.currentTarget)}
                  onPlay={() => setPausedAt(null)}
                  onPause={() => i === active && setPausedAt(i)}
                  style={{ aspectRatio: ratio }}
                  className="relative h-full max-w-full cursor-pointer object-contain lg:rounded-2xl"
                />
              ) : (
                <span aria-hidden style={{ aspectRatio: ratio }} className="h-full max-w-full" />
              )}
            </section>
          );
        })}
      </div>

      {paused && (
        <span className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-1 size-7" fill="currentColor" />
          </span>
        </span>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t.planning.close}
        title={t.planning.close}
        className={`${ROUND_BUTTON} fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3`}
      >
        <X className="size-5" />
      </button>

      <div className="fixed top-1/2 right-3 flex -translate-y-1/2 flex-col gap-2">
        {clip.sound && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? E.soundOn : E.soundOff}
            title={muted ? E.soundOn : E.soundOff}
            className={ROUND_BUTTON}
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={active === 0}
          aria-label={E.previous}
          title={E.previous}
          className={`${ROUND_BUTTON} [@media(pointer:coarse)]:hidden`}
        >
          <ChevronUp className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={active === clips.length - 1}
          aria-label={E.next}
          title={E.next}
          className={`${ROUND_BUTTON} [@media(pointer:coarse)]:hidden`}
        >
          <ChevronDown className="size-5" />
        </button>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {failedAt === active && (
          <p role="alert" className="rounded-lg bg-black/70 px-3 py-1.5 text-sm text-white">
            {E.recreateError}
          </p>
        )}
        <button
          type="button"
          onClick={recreate}
          disabled={recreating}
          className="btn btn-accent pointer-events-auto w-full max-w-xs px-6 py-3 text-base"
        >
          {recreating ? <Loader2 className="animate-spin" /> : <Repeat2 />}
          {recreating ? E.recreating : E.recreate}
        </button>
      </div>
    </div>,
    document.body,
  );
}
