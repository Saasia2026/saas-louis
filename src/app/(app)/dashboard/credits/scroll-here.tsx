"use client";

import { useEffect, useRef } from "react";

// Amène l'écran sur ce point dès l'arrivée sur la page (ici : les packs,
// quand on vient du studio à court de crédits).
export function ScrollHere() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  }, []);
  return <span ref={ref} aria-hidden className="block scroll-mt-24" />;
}
