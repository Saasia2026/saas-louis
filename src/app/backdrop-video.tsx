"use client";

import { useEffect, useState } from "react";

// Vidéo de fond plein cadre, comme sur la landing : horizontale sur un écran
// large, verticale sur un écran en hauteur (téléphone), avec un voile sombre
// en haut et en bas pour lire le texte posé dessus. `h` et `v` : chemins
// sans extension (.mp4 pour la vidéo, .jpg pour l'affiche).
const VEIL =
  "linear-gradient(to bottom, rgb(0 0 0 / 0.45), transparent 22%, transparent 50%, rgb(0 0 0 / 0.72)), linear-gradient(to right, rgb(0 0 0 / 0.35), transparent 60%)";

export function BackdropVideo({ h, v }: { h: string; v: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const tall = window.matchMedia("(max-aspect-ratio: 4/5)");
    const sync = () => setSrc(tall.matches ? v : h);
    sync();
    tall.addEventListener("change", sync);
    return () => tall.removeEventListener("change", sync);
  }, [h, v]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      {src && (
        <video
          key={src}
          src={`${src}.mp4`}
          poster={`${src}.jpg`}
          muted
          loop
          autoPlay
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          className="absolute inset-0 size-full animate-fade-up object-cover"
        />
      )}
      <div className="absolute inset-0" style={{ background: VEIL }} />
    </div>
  );
}
