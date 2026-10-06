"use client";

import { Play } from "lucide-react";
import { useState } from "react";

// Vidéo YouTube intégrée par le lecteur officiel, chargé seulement au clic :
// avant, une simple miniature (une dizaine de lecteurs YouTube chargés d'un
// coup alourdiraient la page). Domaine sans cookie de YouTube. En grand
// format, la miniature haute définition, et la vidéo occupe toute la hauteur
// de sa case sur ordinateur.
export function YouTubeLite({
  id,
  title,
  author,
  playLabel,
  large = false,
}: {
  id: string;
  title: string;
  author: string;
  playLabel: string;
  large?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [thumb, setThumb] = useState(large ? "maxresdefault" : "hqdefault");

  return (
    <figure className={large ? "flex h-full flex-col" : undefined}>
      <div
        className={`relative aspect-video overflow-hidden rounded-2xl border border-line bg-black ${large ? "lg:aspect-auto lg:min-h-0 lg:flex-1" : ""}`}
      >
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={playLabel}
            className="group absolute inset-0 size-full"
          >
            {/* Miniature servie par YouTube : pas d'optimisation Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${id}/${thumb}.jpg`}
              alt=""
              loading="lazy"
              onError={() => setThumb("hqdefault")}
              className="size-full object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.04]"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span
              className={`absolute top-1/2 left-1/2 flex -translate-1/2 items-center justify-center rounded-full bg-white text-black shadow-[0_6px_0_rgb(0_0_0/0.35)] transition-transform duration-200 group-hover:scale-110 ${large ? "size-16 sm:size-20" : "size-14"}`}
            >
              <Play className={`ml-0.5 fill-current ${large ? "size-7 sm:size-8" : "size-6"}`} />
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2.5 truncate px-0.5 text-xs text-muted">
        <span className="font-semibold text-text">{author}</span> · {title}
      </figcaption>
    </figure>
  );
}
