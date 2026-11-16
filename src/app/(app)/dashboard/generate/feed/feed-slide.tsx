"use client";
/* eslint-disable @next/next/no-img-element -- posters statiques de public/, sans optimisation */

import { Loader2, Play, Repeat2, Sparkles } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import type { DemoClip } from "../demo-clips";
import { FeedRail } from "./feed-rail";
import { ProgressBar } from "./progress-bar";

// Format au-delà duquel une vidéo n'est plus « verticale » : en dessous elle
// remplit l'écran (object-cover, rognée sur les bords comme sur TikTok), au-
// dessus elle est posée entière sur son image floutée.
const TALL_MAX = 0.7;

function ratioValue(ratio: string) {
  const [w, h] = ratio.split("/").map(Number);
  return w && h ? w / h : 9 / 16;
}

export type SlideLabels = {
  effect: string;
  recreate: string;
  recreating: string;
  recreateError: string;
  like: string;
  save: string;
  share: string;
};

type SlideProps = {
  clip: DemoClip;
  index: number;
  active: boolean;
  // Vidéo montée (courante et voisines) ; poster seul un peu plus loin.
  near: boolean;
  poster: boolean;
  paused: boolean;
  loop: boolean;
  liked: boolean;
  saved: boolean;
  primed: boolean;
  recreating: boolean;
  failed: boolean;
  labels: SlideLabels;
  registerVideo: (index: number, video: HTMLVideoElement | null) => void;
  onTap: (e: React.MouseEvent<HTMLElement>, index: number) => void;
  onPlayState: (index: number, playing: boolean) => void;
  onEnded: (index: number) => void;
  onLike: (index: number) => void;
  onSave: (index: number) => void;
  onShare: (index: number) => void;
  onRecreate: (index: number) => void;
};

// Un écran du fil. Sur téléphone, la vidéo prend tout l'écran ; dès 640 px de
// large (tablette, ordinateur, téléphone couché), elle devient une colonne
// 9:16 centrée sur son image floutée, avec le rail à côté.
export const FeedSlide = memo(function FeedSlide({
  clip,
  index,
  active,
  near,
  poster,
  paused,
  loop,
  liked,
  saved,
  primed,
  recreating,
  failed,
  labels,
  registerVideo,
  onTap,
  onPlayState,
  onEnded,
  onLike,
  onSave,
  onShare,
  onRecreate,
}: SlideProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const shine = useRef<HTMLSpanElement>(null);
  const tall = ratioValue(clip.ratio) <= TALL_MAX;
  const fit = tall ? "object-cover" : "object-contain";
  const getVideo = useCallback(() => video.current, []);

  // « Recréer » s'anime une fois la vidéo regardée quelques secondes : un
  // rebond, puis un reflet qui repasse de temps en temps.
  useEffect(() => {
    if (!primed || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pill.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], {
      duration: 450,
      easing: "ease-out",
    });
    const sweep = shine.current?.animate(
      [
        { transform: "translateX(-100%)", opacity: 1 },
        { transform: "translateX(100%)", opacity: 1, offset: 0.4 },
        { transform: "translateX(100%)", opacity: 1 },
      ],
      { duration: 3200, iterations: Infinity, easing: "ease-in-out" },
    );
    return () => sweep?.cancel();
  }, [primed]);

  return (
    <section
      data-index={index}
      className="relative flex h-dvh snap-start snap-always items-center justify-center overflow-hidden"
    >
      {near && (
        <img
          src={`${clip.base}.jpg`}
          alt=""
          aria-hidden
          className="absolute inset-0 hidden size-full scale-110 object-cover opacity-40 blur-2xl sm:block"
        />
      )}

      <div className="relative size-full sm:aspect-[9/16] sm:h-[calc(100dvh-2.5rem)] sm:w-auto">
        <div className="absolute inset-0 overflow-hidden bg-black sm:rounded-xl">
          {!tall && poster && (
            <img
              src={`${clip.base}.jpg`}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full scale-110 object-cover opacity-80 blur-2xl"
            />
          )}
          {near ? (
            <video
              ref={(el) => {
                video.current = el;
                registerVideo(index, el);
              }}
              src={`${clip.base}.mp4`}
              poster={`${clip.base}.jpg`}
              muted
              loop={loop}
              playsInline
              webkit-playsinline=""
              disablePictureInPicture
              disableRemotePlayback
              preload="auto"
              onPlay={() => onPlayState(index, true)}
              onPause={() => onPlayState(index, false)}
              onEnded={() => onEnded(index)}
              className={`absolute inset-0 size-full ${fit}`}
            />
          ) : (
            poster && (
              <img
                src={`${clip.base}.jpg`}
                alt=""
                aria-hidden
                loading="lazy"
                className={`absolute inset-0 size-full ${fit}`}
              />
            )
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/60 to-transparent"
          />
        </div>

        {/* Couche des gestes : un toucher (son, puis pause), deux (j'aime).
            touch-manipulation : le double toucher ne zoome pas la page. */}
        <div
          aria-hidden
          onClick={(e) => onTap(e, index)}
          className="absolute inset-0 z-10 cursor-pointer touch-manipulation"
        />

        {active && paused && (
          <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <Play className="size-16 text-white/85 drop-shadow-lg" fill="currentColor" />
          </span>
        )}

        {near && (
          <>
            <div className="pointer-events-none absolute right-18 bottom-[calc(env(safe-area-inset-bottom)+1.75rem)] left-3 z-20 flex flex-col items-start gap-2.5 sm:right-3 sm:bottom-6">
              {failed && (
                <p role="alert" className="rounded-lg bg-black/70 px-3 py-1.5 text-sm text-white">
                  {labels.recreateError}
                </p>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <Sparkles className="size-3.5" />
                {labels.effect}
              </span>
              <button
                ref={pill}
                type="button"
                onClick={() => onRecreate(index)}
                disabled={recreating}
                className="btn btn-accent pointer-events-auto relative overflow-hidden px-4 py-2 text-sm"
              >
                <span
                  ref={shine}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent opacity-0"
                />
                {recreating ? <Loader2 className="animate-spin" /> : <Repeat2 />}
                {recreating ? labels.recreating : labels.recreate}
              </button>
            </div>

            <FeedRail
              liked={liked}
              saved={saved}
              labels={labels}
              onLike={() => onLike(index)}
              onSave={() => onSave(index)}
              onShare={() => onShare(index)}
              className="absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 sm:right-auto sm:bottom-6 sm:left-full sm:ml-3"
            />
          </>
        )}

        {active && near && <ProgressBar getVideo={getVideo} />}
      </div>
    </section>
  );
});
