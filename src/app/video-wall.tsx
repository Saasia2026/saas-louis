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

// Les mêmes démos dans le téléphone de l'accroche : trois colonnes, en clair.
const PHONE_COLS: number[][] = [
  [1, 9, 17, 4],
  [2, 10, 18, 12],
  [3, 11, 19, 20],
];

const PHONE_DURATIONS = [34, 26, 30];

// Versions « fond » des démos (public/demos/wall) : 320 px de large, 8 s,
// sans son, ~150 ko chacune. Le mur est affiché à 8 % d'opacité : les
// originaux (12 à 37 Mo) faisaient télécharger ~190 Mo à chaque visite.
const pad = (n: number) => `/demos/wall/demo-${String(n).padStart(2, "0")}`;

// Le mur joue partout, téléphone compris, sauf en mouvement réduit ; sans
// autoPlay ni préchargement, rien n'est téléchargé quand il ne joue pas.
// Onglet caché : tout s'arrête.
const PLAYS = "(prefers-reduced-motion: no-preference)";

// En fond de page (très pâle, fixe) ou, avec `phone`, comme écran du
// téléphone décoratif de l'accroche.
export function VideoWall({ phone = false }: { phone?: boolean }) {
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

  const cols = phone ? PHONE_COLS : COLS;
  const durations = phone ? PHONE_DURATIONS : DURATIONS;

  return (
    <div ref={root} className={phone ? "phone-wall" : "video-wall"} aria-hidden>
      {!phone && <div className="video-wall-fade" />}
      {cols.map((col, ci) => (
        <div
          key={ci}
          className="video-wall-col"
          style={{ animationDuration: `${durations[ci]}s` }}
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
