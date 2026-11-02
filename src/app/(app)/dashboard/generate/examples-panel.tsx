"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useI18n } from "@/i18n/provider";

// Rendus montrés dans l'onglet Exemples (public/examples), avec leur format :
// d'abord la galerie (540 px, sans son), puis les premiers rendus Genjutsu.
const EXAMPLES: { name: string; ratio: string }[] = [
  { name: "gallery/g-01", ratio: "9/16" },
  { name: "gallery/g-02", ratio: "3/4" },
  { name: "gallery/g-03", ratio: "9/16" },
  { name: "gallery/g-04", ratio: "9/16" },
  { name: "gallery/g-05", ratio: "9/16" },
  { name: "gallery/g-06", ratio: "9/16" },
  { name: "gallery/g-07", ratio: "9/16" },
  { name: "gallery/g-08", ratio: "9/16" },
  { name: "gallery/g-09", ratio: "9/16" },
  { name: "gallery/g-10", ratio: "9/16" },
  { name: "gallery/g-11", ratio: "9/16" },
  { name: "gallery/g-12", ratio: "9/16" },
  { name: "gallery/g-13", ratio: "9/16" },
  { name: "gallery/g-14", ratio: "9/16" },
  { name: "gallery/g-15", ratio: "9/16" },
  { name: "gallery/g-16", ratio: "9/16" },
  { name: "gallery/g-17", ratio: "9/16" },
  { name: "gallery/g-18", ratio: "3/4" },
  { name: "gallery/g-19", ratio: "9/16" },
  { name: "gallery/g-20", ratio: "9/16" },
  { name: "gallery/g-21", ratio: "9/16" },
  { name: "genjutsu-cage", ratio: "9/16" },
  { name: "genjutsu-danse", ratio: "9/16" },
  { name: "genjutsu-dunk", ratio: "9/16" },
  { name: "genjutsu-bras-de-fer", ratio: "1/1" },
  { name: "genjutsu-diable", ratio: "9/16" },
  { name: "genjutsu-camion", ratio: "4/3" },
  { name: "genjutsu-lincoln", ratio: "9/16" },
  { name: "genjutsu-panier", ratio: "3/4" },
  { name: "mma-apres", ratio: "9/16" },
  { name: "micro-apres", ratio: "9/16" },
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
        {EXAMPLES.map(({ name, ratio }) => (
          <div
            key={name}
            style={{ aspectRatio: ratio }}
            className="group break-inside-avoid overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
          >
            <Clip name={name} className="transition-transform duration-500 group-hover:scale-[1.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}
