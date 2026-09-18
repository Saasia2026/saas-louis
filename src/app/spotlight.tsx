"use client";

import { useEffect } from "react";

// Donne aux éléments .spotlight la position de la souris (--mx, --my) pour
// que leur halo la suive. Un seul écouteur pour toute la page.
export function Spotlight() {
  useEffect(() => {
    function move(e: PointerEvent) {
      const target = (e.target as Element | null)?.closest<HTMLElement>(".spotlight");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      target.style.setProperty("--my", `${e.clientY - rect.top}px`);
    }
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}
