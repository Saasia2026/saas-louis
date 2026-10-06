"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";

// Exemple de la page d'accueil : en boucle et muet (seule façon de le lancer
// tout seul sur téléphone), le son s'active d'une touche.
export function ExampleVideo({
  src,
  poster,
  label,
  soundOn,
  soundOff,
  aspectRatio = "16:9",
  hasSound = true,
}: {
  src: string;
  poster: string;
  label: string;
  soundOn: string;
  soundOff: string;
  aspectRatio?: string;
  // Fichier sans piste son : pas de bouton.
  hasSound?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
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
        ref={ref}
        src={src}
        poster={poster}
        aria-label={label}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="size-full object-cover"
      />
      {hasSound && (
      <button
        type="button"
        onClick={() => {
          const video = ref.current;
          if (!video) return;
          video.muted = !muted;
          setMuted(!muted);
          if (video.paused) video.play().catch(() => {});
        }}
        aria-label={muted ? soundOn : soundOff}
        title={muted ? soundOn : soundOff}
        className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
      )}
      </div>
    </div>
  );
}
