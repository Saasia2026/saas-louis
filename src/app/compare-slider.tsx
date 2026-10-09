"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useRef, useState } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useSyncedPair } from "@/app/synced-pair";

// Slider avant/après : deux vidéos du même clip lues en même temps, un
// rideau qu'on fait glisser pour comparer (le composant signature des sites
// de référence, codé maison). La vidéo « après » est rognée par clip-path ;
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
  // Position du rideau, en % depuis la gauche.
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const outer = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  // Hors écran, toutes les vidéos du bloc se coupent.
  usePauseWhenHidden(outer);
  // Boucle commune et rattrapage en douceur (les fichiers doivent avoir le
  // même nombre d'images).
  useSyncedPair(beforeRef, afterRef);

  function moveTo(clientX: number) {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100)));
  }

  return (
    <div ref={outer} className={`relative isolate ${bare ? "size-full" : ""} ${className}`}>
      {/* Lumière d'ambiance : l'affiche floutée, statique — flouter une
          vidéo en lecture repeint chaque image et met les GPU à genoux. */}
      {ambient && posterAfter && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterAfter} alt="" aria-hidden className="ambient" />
      )}
    <div
      ref={frame}
      role="slider"
      aria-label={`${labelBefore} / ${labelAfter}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPosition((p) => Math.max(4, p - 4));
        if (e.key === "ArrowRight") setPosition((p) => Math.min(96, p + 4));
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => dragging && moveTo(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      className={`relative isolate w-full cursor-ew-resize touch-none overflow-hidden bg-black bg-clip-padding select-none ${
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
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />
      <video
        ref={afterRef}
        src={after}
        poster={posterAfter}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        aria-hidden
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      />

      {/* Rideau : un trait net, une poignée sobre. */}
      <div
        aria-hidden
        className="absolute inset-y-0 z-10 w-px bg-white/80"
        style={{ left: `${position}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex size-9 -translate-1/2 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white backdrop-blur-sm">
          <ChevronsLeftRight className="size-4" />
        </span>
      </div>

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
