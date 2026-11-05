"use client";

import { Play } from "lucide-react";
import { useRef, useState } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useI18n } from "@/i18n/provider";
import { DEMO_CLIPS, type DemoClip } from "./demo-clips";
import { DemoReels } from "./demo-reels";

function Clip({ clip, label, onOpen, className = "" }: { clip: DemoClip; label: string; onOpen: () => void; className?: string }) {
  return (
    <button type="button" onClick={onOpen} aria-label={label} className="block size-full cursor-pointer">
      <video
        src={`${clip.base}.mp4`}
        poster={`${clip.base}.jpg`}
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
    </button>
  );
}

const [HERO, ...MOSAIC] = DEMO_CLIPS;

// Vignettes affichées d'un coup : le fil, lui, montre toutes les démos, et
// charger toutes les couvertures à l'ouverture pèserait sur un téléphone.
const MOSAIC_STEP = 48;

// Onglet Exemples : l'idée en une phrase à côté d'un rendu, puis une
// mosaïque de rendus qui ne jouent qu'à l'écran. Une démo touchée ouvre le
// fil façon reels, d'où elle peut être reprise dans le studio.
export function ExamplesPanel({ onRecreate }: { onRecreate: (clip: DemoClip) => Promise<boolean> }) {
  const { t } = useI18n();
  const E = t.studio.examples;
  const root = useRef<HTMLDivElement>(null);
  // Démo ouverte dans le fil ; la mosaïque s'arrête pendant ce temps.
  const [opened, setOpened] = useState<number | null>(null);
  const [shown, setShown] = useState(MOSAIC_STEP);
  usePauseWhenHidden(root, opened !== null);

  return (
    <div ref={root} className="space-y-5">
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h2 className="font-headline text-4xl leading-[0.92] uppercase sm:text-5xl">{E.title}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{E.text}</p>
          <button type="button" onClick={() => setOpened(0)} className="btn btn-secondary mt-4 px-4 py-2 text-sm">
            <Play />
            {E.watch}
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding">
          <Clip clip={HERO} label={E.open} onOpen={() => setOpened(0)} />
        </div>
      </div>
      <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
        {MOSAIC.slice(0, shown).map((clip, i) => (
          <div
            key={clip.base}
            style={{ aspectRatio: clip.ratio }}
            className="group break-inside-avoid overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
          >
            <Clip
              clip={clip}
              label={E.open}
              onOpen={() => setOpened(i + 1)}
              className="transition-transform duration-500 group-hover:scale-[1.04]"
            />
          </div>
        ))}
      </div>
      {shown < MOSAIC.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + MOSAIC_STEP)}
          className="btn btn-secondary mx-auto flex px-5 py-2 text-sm"
        >
          {E.showMore}
        </button>
      )}
      {opened !== null && (
        <DemoReels clips={DEMO_CLIPS} start={opened} onClose={() => setOpened(null)} onRecreate={onRecreate} />
      )}
    </div>
  );
}
