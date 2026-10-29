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
      className="relative isolate h-52 animate-fade-up overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding sm:h-64"
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
        <p
          className="font-headline text-[clamp(3.75rem,10vw,8.5rem)] italic leading-[0.8] uppercase"
          style={{
            background: "linear-gradient(180deg, #b0b0b0 0%, #e8e8e8 35%, #ffffff 50%, #a0a0a0 65%, #707070 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >Genjutsu</p>
      </div>
    </div>
  );
}
