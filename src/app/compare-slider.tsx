"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useSyncedPair } from "@/app/synced-pair";

// Avant/après : deux vidéos du même clip lues en même temps, et un rideau
// qui balaie tout seul de l'une à l'autre (animation CSS compare-sweep, sans
// rendu React à chaque image). La vidéo « après » est rognée par clip-path ;
// les deux restent synchronisées sur la durée de la boucle.
export function CompareSlider({
  before,
  after,
  posterBefore,
  posterAfter,
  labelBefore,
  labelAfter,
  aspectRatio = "9:16",
  ambient = false,
  bare = false,
  className = "",
}: {
  before: string;
  after: string;
  posterBefore?: string;
  posterAfter?: string;
  labelBefore: string;
  labelAfter: string;
  aspectRatio?: string;
  // Copie floue de la vidéo « après » derrière le cadre, comme le mode
  // ambiant de YouTube.
  ambient?: boolean;
  // Posé dans un cadre (voir PhoneFrame) : sans bordure ni coins arrondis, il
  // en prend toute la surface.
  bare?: boolean;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  // Hors écran, toutes les vidéos du bloc se coupent.
  usePauseWhenHidden(outer);
  // Boucle commune et rattrapage en douceur (les fichiers doivent avoir le
  // même nombre d'images).
  useSyncedPair(beforeRef, afterRef);

  return (
    <div ref={outer} className={`relative isolate ${bare ? "size-full" : ""} ${className}`}>
      {/* Lumière d'ambiance : l'affiche floutée, statique — flouter une
          vidéo en lecture repeint chaque image et met les GPU à genoux. */}
      {ambient && posterAfter && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterAfter} alt="" aria-hidden className="ambient" />
      )}
    <div
      className={`compare-sweep relative isolate w-full overflow-hidden bg-black bg-clip-padding select-none ${
        bare ? "h-full" : "rounded-2xl border border-line"
      }`}
      style={bare ? undefined : { aspectRatio: aspectRatio.replace(":", " / ") }}
    >
      <video
        ref={beforeRef}
        src={before}
        poster={posterBefore}
        autoPlay
        muted
        playsInline
        webkit-playsinline=""
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <video
        ref={afterRef}
        src={after}
        poster={posterAfter}
        autoPlay
        muted
        playsInline
        webkit-playsinline=""
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover"
        style={{ clipPath: "inset(0 0 0 var(--compare))" }}
      />

      {/* Rideau : un trait net. */}
      <div aria-hidden className="absolute inset-y-0 z-10 w-px bg-white/80" style={{ left: "var(--compare)" }} />

      <span className={`pointer-events-none absolute left-3 z-10 ${bare ? "bottom-[5%]" : "bottom-3"} rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm`}>
        {labelBefore}
      </span>
      <span className={`pointer-events-none absolute right-3 z-10 ${bare ? "bottom-[5%]" : "bottom-3"} rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm`}>
        {labelAfter}
      </span>
    </div>
    </div>
  );
}
