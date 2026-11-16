"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useSyncedPair } from "@/app/synced-pair";

// Durée du balayage qui découvre le résultat.
const SWEEP_SECONDS = 0.7;

// Avant/après : la vidéo d'origine est posée sur le résultat, lue en même
// temps (voir synced-pair), puis un balayage la retire de gauche à droite à
// `revealAt` secondes. Le résultat reste la vidéo que le fil pilote (son,
// pause, progression) ; celle-ci suit, muette.
export function RevealOverlay({
  src,
  revealAt,
  master,
  fit,
  labels,
}: {
  src: string;
  revealAt: number;
  master: RefObject<HTMLVideoElement | null>;
  fit: string;
  labels: { before: string; after: string };
}) {
  const before = useRef<HTMLVideoElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  useSyncedPair(master, before);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const time = master.current?.currentTime ?? 0;
      const done = Math.min(Math.max((time - revealAt) / SWEEP_SECONDS, 0), 1);
      if (before.current) before.current.style.clipPath = `inset(0 0 0 ${done * 100}%)`;
      if (line.current) {
        line.current.style.left = `${done * 100}%`;
        line.current.style.opacity = done > 0 && done < 1 ? "1" : "0";
      }
      if (tag.current) tag.current.textContent = done < 0.5 ? labels.before : labels.after;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [master, revealAt, labels]);

  return (
    <>
      <video
        ref={before}
        src={src}
        muted
        loop
        playsInline
        webkit-playsinline=""
        disablePictureInPicture
        disableRemotePlayback
        preload="auto"
        aria-hidden
        className={`pointer-events-none absolute inset-0 size-full ${fit}`}
      />
      <span
        ref={line}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white opacity-0 shadow-[0_0_8px_rgba(0,0,0,0.5)]"
      />
      <span
        ref={tag}
        className="pointer-events-none absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white sm:top-3"
      />
    </>
  );
}
