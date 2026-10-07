"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";

// Rendus Genjutsu seuls, sans interface ni marque. Sur grand écran, une
// mosaïque de trois colonnes (l'ordre suit le placement automatique de la
// grille) ; sur téléphone, une rangée qui défile au doigt.
const TILES = [
  { file: "genjutsu-salle", span: "lg:col-span-2 lg:row-span-2" },
  { file: "genjutsu-danse", span: "lg:row-span-2" },
  { file: "genjutsu-dunk", span: "lg:row-span-2" },
  { file: "genjutsu-camion", span: "" },
  { file: "genjutsu-panier", span: "lg:row-span-2" },
  { file: "genjutsu-bras-de-fer", span: "" },
];

export function GenjutsuShowcase({ labels }: { labels: string[] }) {
  const container = useRef<HTMLDivElement>(null);
  // Hors écran, les six vidéos se coupent.
  usePauseWhenHidden(container);

  return (
    <div ref={container} className="mx-auto mt-10 max-w-6xl lg:px-6">
      <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:px-6 lg:grid lg:auto-rows-[14rem] lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {TILES.map(({ file, span }, i) => (
          <li
            key={file}
            className={`group relative aspect-[3/4] w-[72%] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding sm:w-[45%] lg:aspect-auto lg:w-auto ${span}`}
          >
            <video
              src={`/examples/${file}.mp4`}
              poster={`/examples/${file}.jpg`}
              aria-label={labels[i]}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="size-full object-cover transition-transform duration-700 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03]"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
