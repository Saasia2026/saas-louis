"use client";
/* eslint-disable @next/next/no-img-element -- posters statiques ou venus de TikTok, sans optimisation */

import { Loader2, Play, Repeat2, Sparkles, Video } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import { FeedRail, type RailLabels } from "./feed-rail";
import type { FeedItem } from "./feed-items";
import { videoPlayer, type FeedPlayer } from "./player";
import { ProgressBar } from "./progress-bar";
import { RevealOverlay } from "./reveal-overlay";
import { TikTokPlayer } from "./tiktok-player";

// Format au-delà duquel une vidéo n'est plus « verticale » : en dessous elle
// remplit l'écran (object-cover, rognée sur les bords comme sur TikTok), au-
// dessus elle est posée entière sur son image floutée.
const TALL_MAX = 0.7;

function ratioValue(ratio: string) {
  const [w, h] = ratio.split("/").map(Number);
  return w && h ? w / h : 9 / 16;
}

export type SlideLabels = RailLabels & {
  effect: string;
  effectPersonas: string;
  recreate: string;
  recreateOwn: string;
  recreating: string;
  recreateError: string;
  before: string;
  after: string;
};

type SlideProps = {
  item: FeedItem;
  index: number;
  active: boolean;
  // Vidéo montée (courante et voisines) ; poster seul un peu plus loin.
  near: boolean;
  poster: boolean;
  paused: boolean;
  loop: boolean;
  liked: boolean;
  saved: boolean;
  likes: number;
  primed: boolean;
  recreating: boolean;
  failed: boolean;
  labels: SlideLabels;
  format: (n: number) => string;
  registerPlayer: (index: number, player: FeedPlayer | null) => void;
  getPlayer: (index: number) => FeedPlayer | undefined;
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
  item,
  index,
  active,
  near,
  poster,
  paused,
  loop,
  liked,
  saved,
  likes,
  primed,
  recreating,
  failed,
  labels,
  format,
  registerPlayer,
  getPlayer,
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
  const tiktok = item.source === "tiktok_embed" && item.tiktokId;
  const tall = tiktok || ratioValue(item.ratio) <= TALL_MAX;
  const fit = tall ? "object-cover" : "object-contain";
  const player = useCallback(() => getPlayer(index), [getPlayer, index]);
  const effect = item.category === "shinka" ? labels.effect : item.category === "personas" ? labels.effectPersonas : null;
  const posterImg = (className: string) =>
    item.posterUrl && (
      <img
        src={item.posterUrl}
        alt=""
        aria-hidden
        loading="lazy"
        // Miniature TikTok expirée : l'écran reste noir plutôt qu'une image cassée.
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        className={className}
      />
    );

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

  let media: React.ReactNode = null;
  if (tiktok) {
    media = (
      <>
        {/* Sous le lecteur : le créateur, visible tant que TikTok n'a rien affiché. */}
        <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white/60">
          {item.creator?.handle}
        </span>
        {active ? (
          <TikTokPlayer
            id={tiktok}
            index={index}
            title={item.creator ? `TikTok ${item.creator.handle}` : "TikTok"}
            loop={loop}
            registerPlayer={registerPlayer}
            onPlayState={onPlayState}
            onEnded={onEnded}
          />
        ) : (
          poster && posterImg(`absolute inset-0 size-full ${fit}`)
        )}
      </>
    );
  } else if (near && item.videoUrl) {
    media = (
      <>
        <video
          ref={(el) => {
            video.current = el;
            registerPlayer(index, el && videoPlayer(el));
          }}
          src={item.videoUrl}
          poster={item.posterUrl ?? undefined}
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
        {item.beforeUrl && item.revealAt !== null && (
          <RevealOverlay
            src={item.beforeUrl}
            revealAt={item.revealAt}
            master={video}
            fit={fit}
            labels={{ before: labels.before, after: labels.after }}
          />
        )}
      </>
    );
  } else if (poster) {
    media = posterImg(`absolute inset-0 size-full ${fit}`);
  }

  return (
    <section
      data-index={index}
      className="relative flex h-dvh snap-start snap-always items-center justify-center overflow-hidden"
    >
      {near && posterImg("absolute inset-0 hidden size-full scale-110 object-cover opacity-40 blur-2xl sm:block")}

      <div className="relative size-full sm:aspect-[9/16] sm:h-[calc(100dvh-2.5rem)] sm:w-auto">
        <div className="absolute inset-0 overflow-hidden bg-black sm:rounded-xl">
          {!tall && poster && posterImg("absolute inset-0 size-full scale-110 object-cover opacity-80 blur-2xl")}
          {media}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/60 to-transparent"
          />
        </div>

        {/* Couche des gestes, au-dessus de tout lecteur (TikTok compris) : un
            toucher (son, puis pause), deux (j'aime). touch-manipulation : le
            double toucher ne zoome pas la page. */}
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
            <div className="pointer-events-none absolute right-18 bottom-[calc(env(safe-area-inset-bottom)+1.75rem)] left-3 z-20 flex flex-col items-start gap-2 sm:right-3 sm:bottom-6">
              {failed && (
                <p role="alert" className="rounded-lg bg-black/70 px-3 py-1.5 text-sm text-white">
                  {labels.recreateError}
                </p>
              )}
              {item.creator && (
                <div className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
                  {item.creator.url ? (
                    <a
                      href={item.creator.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto text-[15px] font-bold hover:underline"
                    >
                      {item.creator.handle}
                    </a>
                  ) : (
                    <span className="text-[15px] font-bold">{item.creator.handle}</span>
                  )}
                  {item.caption && <p className="mt-0.5 line-clamp-2 text-sm leading-snug">{item.caption}</p>}
                </div>
              )}
              {!item.creator && item.caption && (
                <p className="line-clamp-2 text-sm leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
                  {item.caption}
                </p>
              )}
              {effect && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <Sparkles className="size-3.5" />
                  {effect}
                </span>
              )}
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
                {recreating ? <Loader2 className="animate-spin" /> : tiktok ? <Video /> : <Repeat2 />}
                {recreating ? labels.recreating : tiktok ? labels.recreateOwn : labels.recreate}
              </button>
            </div>

            <FeedRail
              creator={item.creator}
              liked={liked}
              saved={saved}
              likes={likes}
              recreations={item.recreateCount}
              labels={labels}
              format={format}
              onLike={() => onLike(index)}
              onSave={() => onSave(index)}
              onShare={() => onShare(index)}
              className="absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 sm:right-auto sm:bottom-6 sm:left-full sm:ml-3"
            />
          </>
        )}

        {active && near && <ProgressBar getPlayer={player} />}
      </div>
    </section>
  );
});
