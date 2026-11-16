"use client";

import { Heart } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

// Cœur qui éclôt là où l'on a tapé deux fois, puis s'envole et disparaît.
export function BurstHeart({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const el = useRef<HTMLSpanElement>(null);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const tilt = Math.random() * 30 - 15;
    const animation = node.animate(
      [
        { transform: `rotate(${tilt}deg) scale(0.3)`, opacity: 0 },
        { transform: `rotate(${tilt}deg) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `rotate(${tilt}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `rotate(${tilt}deg) translateY(-70px) scale(1.4)`, opacity: 0 },
      ],
      { duration: 900, easing: "ease-out", fill: "forwards" },
    );
    animation.onfinish = () => done();
    return () => animation.cancel();
  }, []);

  return (
    <span ref={el} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
      <Heart className="size-24 fill-rose-500 text-rose-500 drop-shadow-lg" />
    </span>
  );
}
