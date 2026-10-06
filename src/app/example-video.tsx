"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";

// Exemple de la page d'accueil : en boucle et muet (seule façon de le lancer
// tout seul sur téléphone).
export function ExampleVideo({
  src,
  poster,
  label,
  aspectRatio = "16:9",
}: {
  src: string;
  poster: string;
  label: string;
  aspectRatio?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  // Hors écran, la vidéo et sa copie d'ambiance se coupent.
  usePauseWhenHidden(container);

  return (
    <div ref={container} className="relative isolate">
      {/* Lumière d'ambiance : l'affiche floutée, statique — flouter une
          vidéo en lecture repeint chaque image et met les GPU à genoux. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" aria-hidden className="ambient" />
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-black"
        style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
      >
        <video
          src={src}
          poster={poster}
          aria-label={label}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      </div>
    </div>
  );
}
