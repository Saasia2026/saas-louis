"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";

// Exemple de la page d'accueil : en boucle et muet (seule façon de le lancer
// tout seul sur téléphone), le son s'active d'une touche.
export function ExampleVideo({
  src,
  poster,
  label,
  soundOn,
  soundOff,
}: {
  src: string;
  poster: string;
  label: string;
  soundOn: string;
  soundOff: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  return (
    <div className="relative isolate">
      <video src={src} autoPlay muted loop playsInline preload="metadata" aria-hidden className="ambient" />
      <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
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
      </div>
    </div>
  );
}
