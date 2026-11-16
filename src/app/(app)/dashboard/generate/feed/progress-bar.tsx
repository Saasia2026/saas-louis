"use client";

import { useEffect, useRef, useState } from "react";

// Barre de lecture fine en bas de la vidéo. Elle avance à chaque image sans
// rendu React (style posé à la main), et on peut la faire glisser pour se
// déplacer dans la vidéo. Au clavier, ← et → font la même chose (voir feed).
export function ProgressBar({ getVideo }: { getVideo: () => HTMLVideoElement | null }) {
  const fill = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const video = getVideo();
      if (video && fill.current && video.duration) {
        fill.current.style.transform = `scaleX(${video.currentTime / video.duration})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getVideo]);

  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const video = getVideo();
    if (!video || !video.duration) return;
    const box = e.currentTarget.getBoundingClientRect();
    const at = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    video.currentTime = at * video.duration;
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
