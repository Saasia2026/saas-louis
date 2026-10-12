"use client";

import { useRef } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";

// Bloc dont les vidéos ne jouent qu'une fois à l'écran (voir pause-hidden.ts),
// pour un bloc rendu sous condition dans un composant plus grand.
export function VisibleVideos({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  usePauseWhenHidden(ref);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
