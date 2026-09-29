"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Three.js ne part pas dans le bundle initial : le morceau se charge quand la
// section approche de l'écran.
const FinalSceneCanvas = dynamic(() => import("./final-scene-canvas"), { ssr: false });

// Toile de fond 3D de l'appel final. Desktop à pointeur seulement (sur
// téléphone la typo se suffit, et la batterie dit merci), rien si
// l'utilisateur préfère les animations réduites. Montée à l'approche, puis
// gardée montée ; l'animation s'arrête hors écran.
export function FinalScene() {
  const holder = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setMounted(true);
      },
      { rootMargin: "300px" },
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {mounted && <FinalSceneCanvas running={visible} />}
    </div>
  );
}
