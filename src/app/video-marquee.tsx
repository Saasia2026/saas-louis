"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";

// Bandeau de rendus qui défile en continu, sur toute la largeur. La liste est
// posée deux fois : l'animation la décale de moitié et boucle sans saut. Au
// survol, le défilement s'arrête ; si l'appareil demande moins de mouvement,
// le bandeau se fait défiler au doigt.
export function VideoMarquee({ items }: { items: { src: string; poster: string; label: string }[] }) {
  const container = useRef<HTMLDivElement>(null);
  // Hors écran, toutes les vidéos du bandeau se coupent.
  usePauseWhenHidden(container);

  return (
    <div
      ref={container}
      className="relative overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]"
    >
      <ul className="flex w-max animate-marquee gap-3 py-2 hover:[animation-play-state:paused] motion-reduce:animate-none sm:gap-4">
        {[...items, ...items].map((item, i) => (
          <li
            key={`${item.src}-${i}`}
            aria-hidden={i >= items.length}
            className="w-36 shrink-0 overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding sm:w-48 lg:w-56"
            style={{ aspectRatio: "9 / 16" }}
          >
            <video
              src={item.src}
              poster={item.poster}
              aria-label={item.label}
              autoPlay
              muted
              loop
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              preload="metadata"
              className="size-full object-cover"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
