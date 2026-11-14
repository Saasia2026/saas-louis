"use client";

import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playInline } from "@/app/inline-video";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { Modal, ModalClose } from "./media-library";

// Ce qu'on tient : une poignée, ou le passage entier.
type Grip = "start" | "end" | "move";

const STEP = 0.1;
const round = (seconds: number) => Math.round(seconds / STEP) * STEP;

function clock(seconds: number) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

// Fenêtre de découpe : le clip en grand, sa frise d'images dessous, et deux
// poignées pour choisir le passage gardé (entre `minSeconds` et `maxSeconds`).
// La lecture tourne en boucle sur le passage. Rien n'est coupé ici : le
// serveur découpe au lancement (voir trimClip).
export function TrimDialog({
  src,
  duration,
  initial,
  minSeconds,
  maxSeconds,
  busy = false,
  onConfirm,
  onSkip,
  onClose,
}: {
  src: string;
  // Durée du clip, lue par le navigateur.
  duration: number;
  initial?: { start: number; length?: number };
  minSeconds: number;
  maxSeconds: number;
  // Fichier encore en cours d'envoi : « Confirmer » attend.
  busy?: boolean;
  onConfirm: (start: number, length: number) => void;
  // Tout le clip, sans découpe.
  onSkip: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const S = t.studio;
  const maxLength = Math.min(maxSeconds, duration);
  const minLength = Math.min(minSeconds, duration);
  const [range, setRange] = useState(() => {
    const start = Math.min(Math.max(0, initial?.start ?? 0), Math.max(0, duration - minLength));
    const end = Math.min(duration, start + Math.max(minLength, Math.min(initial?.length ?? maxLength, maxLength)));
    return { start, end };
  });
  const [time, setTime] = useState(range.start);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ kind: Grip; x: number; start: number; end: number } | null>(null);
  // Le passage courant, lu par la boucle de lecture et les poignées.
  const live = useRef(range);

  // La lecture reste dans le passage : arrivée à sa fin, elle repart du début.
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      const el = video.current;
      if (el && !drag.current) {
        const { start, end } = live.current;
        if (el.currentTime >= end || el.currentTime < start - 0.3) el.currentTime = start;
        setTime(el.currentTime);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  // Frise : quelques images du clip, lues une à une par une vidéo hors page.
  useEffect(() => {
    const canvas = strip.current;
    const box = track.current;
    if (!canvas || !box) return;
    let cancelled = false;
    const reader = document.createElement("video");
    reader.muted = true;
    reader.playsInline = true;
    reader.preload = "auto";
    reader.src = src;
    reader.onloadeddata = async () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = box.clientWidth * ratio;
      canvas.height = box.clientHeight * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx || !reader.videoWidth) return;
      const cell = Math.max(1, Math.round((canvas.height * reader.videoWidth) / reader.videoHeight));
      const count = Math.min(24, Math.max(4, Math.ceil(canvas.width / cell)));
      const width = canvas.width / count;
      for (let i = 0; i < count && !cancelled; i++) {
        await new Promise<void>((resolve) => {
          reader.onseeked = () => resolve();
          reader.onerror = () => resolve();
          reader.currentTime = Math.min(duration - 0.05, ((i + 0.5) * duration) / count);
        });
        if (cancelled) return;
        // Image recadrée au centre pour remplir sa case.
        const scale = Math.max(width / reader.videoWidth, canvas.height / reader.videoHeight);
        const w = width / scale;
        const h = canvas.height / scale;
        ctx.drawImage(reader, (reader.videoWidth - w) / 2, (reader.videoHeight - h) / 2, w, h, i * width, 0, width, canvas.height);
      }
    };
    return () => {
      cancelled = true;
      reader.removeAttribute("src");
      reader.load();
    };
  }, [src, duration]);

  function seek(seconds: number) {
    const el = video.current;
    if (!el) return;
    el.currentTime = seconds;
    setTime(seconds);
  }

  // Déplace une poignée (ou tout le passage) : la durée reste entre le
  // minimum et le maximum, l'autre bord suit quand il le faut.
  function move(kind: Grip, from: { start: number; end: number }, delta: number) {
    let { start, end } = from;
    if (kind === "start") {
      start = round(Math.min(Math.max(0, from.start + delta), duration - minLength));
      if (end - start < minLength) end = start + minLength;
      if (end - start > maxLength) end = start + maxLength;
    } else if (kind === "end") {
      end = round(Math.max(Math.min(duration, from.end + delta), minLength));
      if (end - start < minLength) start = end - minLength;
      if (end - start > maxLength) start = end - maxLength;
    } else {
      const length = from.end - from.start;
      start = round(Math.min(Math.max(0, from.start + delta), duration - length));
      end = start + length;
    }
    start = Math.max(0, start);
    end = Math.min(duration, end);
    live.current = { start, end };
    setRange(live.current);
    // L'image suit le bord qu'on déplace.
    seek(kind === "end" ? end : start);
  }

  function grab(kind: Grip, e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, ...live.current };
  }

  function dragTo(kind: Grip, e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    const width = track.current?.clientWidth;
    if (!d || d.kind !== kind || !width) return;
    move(kind, d, ((e.clientX - d.x) / width) * duration);
  }

  // On relâche : la lecture repart du début du passage.
  function release() {
    if (!drag.current) return;
    drag.current = null;
    seek(live.current.start);
  }

  function nudge(kind: Grip, e: React.KeyboardEvent<HTMLElement>) {
    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    move(kind, live.current, dir * (e.shiftKey ? 1 : STEP));
  }

  const percent = (seconds: number) => `${(seconds / duration) * 100}%`;
  const length = range.end - range.start;
  const number = (n: number) => n.toLocaleString(INTL_LOCALES[locale], { maximumFractionDigits: 1 });
  const slider = (label: string, value: number) => ({
    role: "slider" as const,
    tabIndex: 0,
    "aria-label": label,
    "aria-valuemin": 0,
    "aria-valuemax": Math.round(duration * 10) / 10,
    "aria-valuenow": Math.round(value * 10) / 10,
    "aria-valuetext": clock(value),
  });

  return (
    <Modal label={S.trimTitle} onClose={onClose} className="sm:max-w-3xl">
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5">
        <h2 className="text-base font-semibold">{S.trimTitle}</h2>
        <ModalClose onClose={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black px-4">
        <video
          ref={video}
          src={src}
          muted={muted}
          autoPlay
          playsInline
          webkit-playsinline=""
          disablePictureInPicture
          onLoadedMetadata={(e) => (e.currentTarget.currentTime = range.start)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={(e) => {
            e.currentTarget.currentTime = live.current.start;
            playInline(e.currentTarget);
          }}
          onClick={(e) => (e.currentTarget.paused ? playInline(e.currentTarget) : e.currentTarget.pause())}
          className="max-h-[min(52dvh,30rem)] max-w-full cursor-pointer"
        />
      </div>

      <div className="space-y-3 px-4 pt-4 pb-4 sm:px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const el = video.current;
              if (!el) return;
              if (el.paused) playInline(el);
              else el.pause();
            }}
            aria-label={playing ? S.player.pause : S.player.play}
            title={playing ? S.player.pause : S.player.play}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text transition-colors hover:bg-[var(--surface-hover)]"
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
          </button>

          <div
            ref={track}
            className="relative h-14 min-w-0 flex-1 touch-none overflow-hidden rounded-xl bg-surface-2 select-none"
            onPointerDown={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const at = ((e.clientX - box.left) / box.width) * duration;
              seek(Math.min(Math.max(at, range.start), range.end - 0.05));
            }}
          >
            <canvas ref={strip} aria-hidden className="absolute inset-0 size-full" />
            <span aria-hidden className="absolute inset-y-0 left-0 bg-black/65" style={{ width: percent(range.start) }} />
            <span aria-hidden className="absolute inset-y-0 right-0 bg-black/65" style={{ left: percent(range.end) }} />
            <div
              onPointerDown={(e) => grab("move", e)}
              onPointerMove={(e) => dragTo("move", e)}
              onPointerUp={release}
              className="absolute inset-y-0 cursor-grab rounded-lg border-y-2 border-accent active:cursor-grabbing"
              style={{ left: percent(range.start), width: percent(length) }}
            >
              <span
                {...slider(S.trimStart, range.start)}
                onPointerDown={(e) => grab("start", e)}
                onPointerMove={(e) => dragTo("start", e)}
                onPointerUp={release}
                onKeyDown={(e) => nudge("start", e)}
                className="absolute inset-y-0 left-0 flex w-3.5 cursor-ew-resize items-center justify-center rounded-l-lg bg-accent outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="h-5 w-0.5 rounded-full bg-white/90" />
              </span>
              <span
                {...slider(S.trimEnd, range.end)}
                onPointerDown={(e) => grab("end", e)}
                onPointerMove={(e) => dragTo("end", e)}
                onPointerUp={release}
                onKeyDown={(e) => nudge("end", e)}
                className="absolute inset-y-0 right-0 flex w-3.5 cursor-ew-resize items-center justify-center rounded-r-lg bg-accent outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="h-5 w-0.5 rounded-full bg-white/90" />
              </span>
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
              style={{ left: percent(Math.min(Math.max(time, range.start), range.end)) }}
            />
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? S.player.unmute : S.player.mute}
            title={muted ? S.player.unmute : S.player.mute}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-muted transition-colors hover:text-text"
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
          <span>
            {clock(range.start)} – {clock(range.end)}
          </span>
          <span className="text-sm font-semibold text-text">{fmt(S.trimKept, { seconds: number(length) })}</span>
          <span>{fmt(S.trimLimits, { min: number(minLength), max: number(maxLength) })}</span>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onSkip} disabled={busy} className="btn btn-secondary">
            {S.trimSkip}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(round(range.start), round(length))}
            disabled={busy}
            className="btn btn-accent"
          >
            {busy && <Loader2 className="animate-spin" />}
            {busy ? S.uploading : S.trimConfirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}
