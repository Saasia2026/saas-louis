"use client";

import { useEffect, useRef } from "react";
import { playInline } from "./inline-video";

const COLS: number[][] = [
  [1, 9, 17],
  [2, 10, 18],
  [3, 11, 19],
  [4, 12, 20],
];

const DURATIONS = [58, 44, 52, 40];

// Versions « fond » des démos (public/demos/wall) : 320 px de large, 8 s,
// sans son, ~150 ko chacune. Le mur est affiché à 8 % d'opacité : les
// originaux (12 à 37 Mo) faisaient télécharger ~190 Mo à chaque visite.
const pad = (n: number) => `/demos/wall/demo-${String(n).padStart(2, "0")}`;

// Le mur ne joue que sur grand écran, à la souris, sans mouvement réduit
// (ailleurs il est masqué en CSS) ; sans autoPlay ni préchargement, rien
// n'est téléchargé quand il ne joue pas. Onglet caché : tout s'arrête.
const PLAYS = "(min-width: 768px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export function VideoWall() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const query = window.matchMedia(PLAYS);
    const videos = [...el.querySelectorAll("video")];
    // Les colonnes défilent : seules les vignettes dans l'écran jouent.
    const inView = new Set<Element>();
    const sync = () => {
      const on = query.matches && document.visibilityState === "visible";
      for (const video of videos) {
        if (on && inView.has(video)) playInline(video);
        else video.pause();
      }
    };
    const visible = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) inView.add(target);
        else inView.delete(target);
      }
      sync();
    });
    videos.forEach((video) => visible.observe(video));
    query.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      visible.disconnect();
      query.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div ref={root} className="video-wall" aria-hidden>
      <div className="video-wall-fade" />
      {COLS.map((col, ci) => (
        <div
          key={ci}
          className="video-wall-col"
          style={{ animationDuration: `${DURATIONS[ci]}s` }}
        >
          {[...col, ...col].map((n, i) => (
            <video
              key={`${n}-${i}`}
              src={`${pad(n)}.mp4`}
              poster={`${pad(n)}.jpg`}
              muted
              loop
              preload="none"
              playsInline
              webkit-playsinline=""
              disablePictureInPicture
              disableRemotePlayback
              className="video-wall-thumb pointer-events-none"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
