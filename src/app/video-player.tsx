"use client";

import { Maximize, Pause, Play, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";

function clock(seconds: number) {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// État d'une vidéo pilotée par le lecteur maison. videoProps se pose sur le
// <video>, qui peut vivre ailleurs que la barre (voir ResultStage).
export function usePlayer({ muted: startMuted = true }: { muted?: boolean } = {}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(startMuted);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // timeupdate ne tombe que quelques fois par seconde : la barre suit l'image.
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      if (ref.current) setTime(ref.current.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const seekTo = (seconds: number) => {
    const v = ref.current;
    if (!v || !duration) return;
    v.currentTime = Math.min(Math.max(seconds, 0), duration);
    setTime(v.currentTime);
  };

  const fullscreen = () => {
    const v = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen();
    else v.webkitEnterFullscreen?.();
  };

  return {
    ready,
    playing,
    muted,
    time,
    duration,
    toggle,
    seekTo,
    fullscreen,
    toggleMuted: () => setMuted((m) => !m),
    videoProps: {
      ref,
      muted,
      onClick: toggle,
      onLoadedData: () => setReady(true),
      onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const d = e.currentTarget.duration;
        setDuration(Number.isFinite(d) ? d : 0);
      },
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => setTime(e.currentTarget.currentTime),
    },
  };
}

export type Player = ReturnType<typeof usePlayer>;

// Barre de lecture sous la vidéo : rien ne recouvre l'image. compact pour les
// vignettes étroites (temps écoulé seul).
export function PlayerBar({ player, compact = false }: { player: Player; compact?: boolean }) {
  const { t } = useI18n();
  const P = t.studio.player;
  const { time, duration, playing, muted } = player;
  const progress = duration ? (time / duration) * 100 : 0;

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    player.seekTo(((event.clientX - box.left) / box.width) * duration);
  };

  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={P.seek}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${clock(time)} / ${clock(duration)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") player.seekTo(time - 1);
          else if (e.key === "ArrowRight") player.seekTo(time + 1);
          else return;
          e.preventDefault();
        }}
        className="group flex h-4 cursor-pointer touch-none items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="relative h-1 w-full rounded-full bg-surface-3 transition-[height] duration-150 group-hover:h-1.5">
          <div className="absolute inset-y-0 left-0 rounded-full bg-text" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className={`flex items-center text-muted ${compact ? "" : "mt-1 gap-1"}`}>
        <PlayerButton
          icon={playing ? Pause : Play}
          label={playing ? P.pause : P.play}
          onClick={player.toggle}
          compact={compact}
        />
        <PlayerButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? P.unmute : P.mute}
          onClick={player.toggleMuted}
          compact={compact}
        />
        <span className={`tabular-nums ${compact ? "ml-0.5 text-[0.6875rem]" : "ml-1 text-xs"}`}>
          {compact ? clock(time) : `${clock(time)} / ${clock(duration)}`}
        </span>
        <PlayerButton
          icon={Maximize}
          label={P.fullscreen}
          onClick={player.fullscreen}
          compact={compact}
          className="ml-auto"
        />
      </div>
    </div>
  );
}

function PlayerButton({
  icon: Icon,
  label,
  onClick,
  compact,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  compact: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-text ${
        compact ? "size-7" : "size-8"
      } ${className}`}
    >
      <Icon className={compact ? "size-3.5" : "size-4"} />
    </button>
  );
}

// Vidéo dans son cadre, barre de lecture dessous. children : ce qui se pose
// sur le cadre (bouton de suppression…).
export function VideoPlayer({
  src,
  aspectRatio,
  compact = false,
  className = "",
  children,
}: {
  src: string;
  aspectRatio: string;
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const player = usePlayer({ muted: false });
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
        style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
      >
        {children}
        <video
          // #t= : la première image s'affiche avant la lecture.
          src={`${src}#t=0.1`}
          preload="metadata"
          loop
          playsInline
          webkit-playsinline=""
          {...player.videoProps}
          className="size-full cursor-pointer object-contain"
        />
      </div>
      <PlayerBar player={player} compact={compact} />
    </div>
  );
}
