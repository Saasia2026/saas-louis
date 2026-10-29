"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useI18n } from "@/i18n/provider";

// Bandeau du studio : le nom du moteur en très grand, sur un de ses rendus en
// boucle. « Propulsé par » : Genjutsu est un moteur tiers, pas une création
// de TwinPost.
export function GenjutsuBanner() {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  // Hors écran (sur mobile, sous le formulaire), la vidéo se coupe.
  usePauseWhenHidden(box);

  return (
    <div
      ref={box}
      className="relative isolate h-56 animate-fade-up overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding sm:h-72"
    >
      <video
        src="/examples/genjutsu-salle.mp4"
        poster="/examples/genjutsu-salle.jpg"
        autoPlay
        muted
        loop
        playsInline
        webkit-playsinline=""
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full object-cover"
      />
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-black/5" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <p className="text-xs font-semibold text-white/75 sm:text-sm">{t.studio.poweredByLabel}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/genjutsu-logos/genjutsu-chrome.png"
          alt="Genjutsu"
          className="mt-1 h-20 w-auto mix-blend-screen sm:h-28"
        />
      </div>
    </div>
  );
}
