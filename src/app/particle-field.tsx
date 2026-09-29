"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Three.js reste hors du bundle initial : le champ se charge après le rendu.
const ParticleFieldCanvas = dynamic(() => import("./particle-field-canvas"), { ssr: false });

// Fond de page du landing : le champ de particules fixe derrière tout le
// contenu. Desktop à pointeur seulement, rien si l'utilisateur préfère les
// animations réduites — le fond noir nu reste la base.
export function ParticleField({
  dustCount,
  sparkCount,
}: {
  dustCount?: number;
  sparkCount?: number;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Suivi en continu : une fenêtre redimensionnée ou un réglage d'animations
    // changé active ou coupe le champ, au lieu de figer l'état du montage.
    const desktop = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(desktop.matches && !reduced.matches);
    // Un tour de boucle plus tard : le premier rendu de la page passe
    // d'abord (setTimeout et non requestAnimationFrame, qui ne tire jamais
    // dans un onglet non peint).
    const timer = setTimeout(update, 0);
    desktop.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      clearTimeout(timer);
      desktop.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  if (!enabled) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <ParticleFieldCanvas dustCount={dustCount} sparkCount={sparkCount} />
    </div>
  );
}
