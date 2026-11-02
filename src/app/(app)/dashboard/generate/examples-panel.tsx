"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useI18n } from "@/i18n/provider";

// Rendus Genjutsu montrés dans l'onglet Exemples (public/examples).
const EXAMPLES = [
  "genjutsu-cage",
  "genjutsu-danse",
  "genjutsu-dunk",
  "genjutsu-bras-de-fer",
  "genjutsu-diable",
  "genjutsu-camion",
  "genjutsu-lincoln",
  "genjutsu-panier",
  "mma-apres",
  "micro-apres",
];

function Clip({ name, className = "" }: { name: string; className?: string }) {
  return (
    <video
      src={`/examples/${name}.mp4`}
      poster={`/examples/${name}.jpg`}
      muted
      loop
      playsInline
      webkit-playsinline=""
      disablePictureInPicture
      disableRemotePlayback
      preload="none"
      aria-hidden
      className={`pointer-events-none size-full object-cover ${className}`}
    />
  );
}

// Onglet Exemples : l'idée en une phrase à côté d'un rendu, puis une
// mosaïque de rendus qui ne jouent qu'à l'écran.
export function ExamplesPanel() {
  const { t } = useI18n();
  const E = t.studio.examples;
  const root = useRef<HTMLDivElement>(null);
  usePauseWhenHidden(root);

  return (
    <div ref={root} className="space-y-5">
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h2 className="font-headline text-4xl leading-[0.92] uppercase sm:text-5xl">{E.title}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{E.text}</p>
        </div>
        <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding">
          <Clip name="genjutsu-salle" />
        </div>
      </div>
      <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
        {EXAMPLES.map((name, i) => (
          <div
            key={name}
            className={`group overflow-hidden rounded-xl border border-line bg-black bg-clip-padding ${
              i % 3 === 0 ? "aspect-[3/4]" : "aspect-[9/16]"
            } break-inside-avoid`}
          >
            <Clip name={name} className="transition-transform duration-500 group-hover:scale-[1.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}
