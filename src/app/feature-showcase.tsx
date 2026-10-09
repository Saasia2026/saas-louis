"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Media = { kind: "video"; src: string; poster: string } | { kind: "refund" };

export type Feature = { title: string; text: string; media: Media };

export type RefundMock = { clip: string; status: string; refunded: string; balance: string; balanceValue: string; poster: string };

// Vitrine des fonctionnalités : la liste d'un côté, un vrai rendu de l'autre.
// Une jauge sous l'élément ouvert avance toute seule puis passe au suivant ;
// elle s'arrête au survol, hors écran, et ne démarre pas si l'appareil
// demande moins de mouvement (on choisit alors au clic).
export function FeatureShowcase({ items, refund }: { items: Feature[]; refund: RefundMock }) {
  const root = useRef<HTMLDivElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Chaque rendu reprend du début quand il s'affiche.
  useEffect(() => {
    const video = videos.current[active];
    if (video) video.currentTime = 0;
  }, [active]);

  // Seul le rendu affiché joue, et seulement quand la section est à l'écran.
  useEffect(() => {
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (i === active && inView) video.play().catch(() => {});
      else video.pause();
    });
  }, [active, inView]);

  const paused = hovered || !inView;

  return (
    <div
      ref={root}
      // Pause au survol de la souris seulement : sur téléphone, un toucher
      // déclencherait un survol qui ne se termine jamais.
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="mt-12 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-line bg-black bg-clip-padding sm:aspect-[16/11] lg:order-2 lg:aspect-square">
        {items.map(({ title, media }, i) => (
          <div
            key={title}
            aria-hidden={i !== active}
            className={`absolute inset-0 transition-opacity duration-700 ${i === active ? "opacity-100" : "opacity-0"}`}
          >
            {media.kind === "video" ? (
              <>
                {/* Fond : l'affiche floutée remplit les bords d'un rendu
                    vertical ou horizontal, sans le recadrer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media.poster} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl saturate-150" />
                <video
                  ref={(el) => {
                    videos.current[i] = el;
                  }}
                  src={media.src}
                  poster={media.poster}
                  muted
                  loop
                  playsInline
                  disablePictureInPicture
                  disableRemotePlayback
                  preload="metadata"
                  className="relative size-full object-contain"
                />
              </>
            ) : (
              <RefundCard {...refund} active={i === active} />
            )}
          </div>
        ))}
      </div>

      <ol className="border-t border-line lg:order-1">
        {items.map(({ title, text }, i) => {
          const open = i === active;
          return (
            <li key={title} className="relative border-b border-line">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={open}
                className="group w-full py-5 text-left"
              >
                <span className="flex items-baseline gap-4">
                  <span
                    className={`w-6 shrink-0 font-headline text-sm tabular-nums transition-colors ${open ? "text-accent-light" : "text-faint"}`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`font-headline text-3xl leading-none transition-colors duration-300 sm:text-4xl ${open ? "text-text" : "text-faint group-hover:text-muted"}`}
                  >
                    {title}
                  </span>
                </span>
                {/* Description : s'ouvre en douceur (0fr → 1fr). */}
                <span
                  className="grid transition-[grid-template-rows] duration-500 [transition-timing-function:var(--ease-out)]"
                  style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                >
                  <span className="overflow-hidden">
                    <span className="block max-w-md pt-3 pl-10 text-sm leading-relaxed text-muted">{text}</span>
                  </span>
                </span>
              </button>
              {open && (
                <span
                  aria-hidden
                  onAnimationEnd={() => setActive((i + 1) % items.length)}
                  className="absolute inset-x-0 -bottom-px h-0.5 origin-left animate-feature-progress bg-accent motion-reduce:hidden"
                  style={{ animationPlayState: paused ? "paused" : "running" }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// « Zéro risque » en image : une ligne d'historique refusée, et ses crédits
// qui reviennent.
function RefundCard({ clip, status, refunded, balance, balanceValue, poster, active }: RefundMock & { active: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      {/* Même fond que les rendus : le clip refusé, flouté et assombri. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl saturate-150" />
      <span className="absolute inset-0 bg-black/45" />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)]">
        <div className="flex items-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" className="h-16 w-11 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{clip}</p>
            <p className="mt-0.5 text-sm font-medium text-danger">{status}</p>
          </div>
        </div>
        {/* Rejoue son entrée chaque fois que la carte s'affiche. */}
        <p
          key={String(active)}
          className={`mt-5 flex items-center gap-2 rounded-xl bg-success/12 px-3.5 py-3 font-semibold text-success ${active ? "animate-fade-up [animation-delay:450ms]" : ""}`}
        >
          <RotateCcw className="size-4" />
          {refunded}
        </p>
        <p className="mt-3.5 flex justify-between px-1 text-sm text-muted">
          <span>{balance}</span>
          <span className="font-semibold text-text tabular-nums">{balanceValue}</span>
        </p>
      </div>
    </div>
  );
}
