"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import s from "./page-transition.module.css";

// Dernier endroit touché (onglet, lien du menu…) : la page suivante s'ouvre
// depuis ce point, comme les écrans de la landing.
let lastTap: { x: number; y: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => (lastTap = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });
}

// Gabarit des pages de l'espace connecté : Next le remonte à chaque
// changement de page, ce qui rejoue l'ouverture en cercle.
export default function Template({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  // Point de départ du cercle, ramené au cadre de la page (avant le premier
  // affichage, pour ne pas sauter).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !lastTap) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--cx", `${lastTap.x - r.left}px`);
    el.style.setProperty("--cy", `${lastTap.y - r.top}px`);
  }, []);

  return (
    <div ref={box} className={s.page} style={{ "--cx": "50%", "--cy": "0%" } as CSSProperties}>
      {children}
    </div>
  );
}
