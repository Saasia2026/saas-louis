"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";

// 4 colonnes × 3 rangées = 12 cellules. Le bloc « military » prend 2×2 (4),
// « courtyard » 1×2 (2), les 6 autres 1×1. Aucune case vide.
const TILES = [
  { src: "/showcase/military", span: "lg:col-span-2 lg:row-span-2" },
  { src: "/showcase/courtyard", span: "lg:row-span-2" },
  { src: "/showcase/army", span: "" },
  { src: "/showcase/cats", span: "" },
  { src: "/showcase/fight", span: "" },
  { src: "/showcase/henry", span: "" },
  { src: "/showcase/gasmask", span: "" },
  { src: "/showcase/dog", span: "" },
];

export function GenjutsuShowcase({ labels }: { labels: string[] }) {
  const container = useRef<HTMLDivElement>(null);
  usePauseWhenHidden(container);

  return (
    <div ref={container} className="mx-auto mt-10 max-w-6xl lg:px-6">
      <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:px-6 lg:grid lg:auto-rows-[15rem] lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 [grid-auto-flow:dense]">
        {TILES.map(({ src, span }, i) => (
          <li
            key={src}
            className={`group relative aspect-[3/4] w-[55%] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding sm:w-[36%] lg:aspect-auto lg:w-auto ${span}`}
          >
            <video
              src={`${src}.mp4`}
              poster={`${src}.jpg`}
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
