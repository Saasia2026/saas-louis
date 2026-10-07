"use client";

import Lenis from "lenis";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useSyncedPair } from "@/app/synced-pair";

// Animations du landing seulement : le défilement à inertie (Lenis), la
// bande avant/après pilotée par le scroll et le bouton magnétique. Le
// dashboard reste en défilement natif : un outil n'a pas à flotter.

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, anchors: true });
    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}

// Bande cinéma : le rideau balaie l'original vers le personnage au rythme du
// défilement — la version passive du CompareSlider, pour le bas de page.
export function ScrollWipe({
  before,
  after,
  posterBefore,
  posterAfter,
  labelBefore,
  labelAfter,
}: {
  before: string;
  after: string;
  posterBefore?: string;
  posterAfter?: string;
  labelBefore: string;
  labelAfter: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  // Hors écran, les deux vidéos se coupent.
  usePauseWhenHidden(frame);
  const { scrollYProgress } = useScroll({
    target: frame,
    offset: ["start 90%", "end 45%"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });
  // Le rideau part de la droite (l'original plein cadre) et découvre le
  // personnage en descendant la page.
  const edge = useTransform(progress, (v) => 94 - v * 88);
  const clipPath = useTransform(edge, (v) => `inset(0 0 0 ${v}%)`);
  const left = useTransform(edge, (v) => `${v}%`);
  // L'étiquette visible suit le rideau.
  const beforeOpacity = useTransform(progress, [0, 0.75, 0.95], [1, 1, 0]);
  const afterOpacity = useTransform(progress, [0, 0.2, 1], [0, 1, 1]);
  // Boucle commune et rattrapage en douceur.
  useSyncedPair(beforeRef, afterRef);

  return (
    <div
      ref={frame}
      className="relative isolate mx-auto aspect-[9/16] w-full max-w-[20rem] overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding sm:max-w-[22rem]"
    >
      <video
        ref={beforeRef}
        src={before}
        poster={posterBefore}
        autoPlay
        muted
        playsInline
        preload="metadata"
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />
      <motion.video
        ref={afterRef}
        src={after}
        poster={posterAfter}
        autoPlay
        muted
        playsInline
        preload="metadata"
        aria-hidden
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath }}
      />
      <motion.div aria-hidden className="absolute inset-y-0 z-10 w-px bg-white/80" style={{ left }} />
      <motion.span
        style={{ opacity: beforeOpacity }}
        className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
      >
        {labelBefore}
      </motion.span>
      <motion.span
        style={{ opacity: afterOpacity }}
        className="pointer-events-none absolute right-3 bottom-3 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
      >
        {labelAfter}
      </motion.span>
    </div>
  );
}

// Bouton magnétique : il glisse doucement vers le curseur qui s'approche,
// puis revient à sa place.
export function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.3 });

  return (
    <motion.div
      ref={ref}
      className="inline-block"
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        x.set((e.clientX - rect.left - rect.width / 2) * 0.28);
        y.set((e.clientY - rect.top - rect.height / 2) * 0.28);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
