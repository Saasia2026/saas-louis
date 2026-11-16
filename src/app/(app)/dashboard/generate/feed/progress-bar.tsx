"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedPlayer } from "./player";

// Barre de lecture fine en bas de la vidéo. Elle avance à chaque image sans
// rendu React (style posé à la main), et on peut la faire glisser pour se
// déplacer dans la vidéo. Au clavier, ← et → font la même chose (voir feed).
export function ProgressBar({ getPlayer }: { getPlayer: () => FeedPlayer | undefined }) {
  const fill = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const progress = getPlayer()?.progress();
      if (progress && fill.current) {
        fill.current.style.transform = `scaleX(${Math.min(progress.current / progress.duration, 1)})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getPlayer]);

  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const player = getPlayer();
    const progress = player?.progress();
    if (!player || !progress) return;
    const box = e.currentTarget.getBoundingClientRect();
    const at = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    player.seek(at * progress.duration);
  }

  return (
    <div
      aria-hidden
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        seek(e);
      }}
      onPointerMove={(e) => dragging && seek(e)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      className="pointer-events-auto absolute inset-x-0 bottom-[env(safe-area-inset-bottom)] z-20 flex h-5 cursor-pointer touch-none items-end"
    >
      <span className={`relative w-full bg-white/25 transition-[height] ${dragging ? "h-1" : "h-0.5"}`}>
        <span ref={fill} className="absolute inset-0 origin-left scale-x-0 bg-white" />
      </span>
    </div>
  );
}
