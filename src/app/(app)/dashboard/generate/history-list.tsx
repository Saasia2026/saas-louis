"use client";

import {
  CalendarDays,
  CirclePlay,
  Clock,
  Download,
  Film,
  Ghost,
  Layers,
  MonitorPlay,
  Move,
  PawPrint,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  TriangleAlert,
  UserRound,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { AspectRatio } from "@/lib/generation";
import type { SwapHistoryItem } from "../swap-history";
import { DeleteButton } from "../videos/delete-button";

// Largeur de la vignette selon le format : même hauteur à peu près pour tous,
// et sur mobile une vidéo verticale ne prend pas tout l'écran.
const THUMB_WIDTH: Record<AspectRatio, string> = {
  "9:16": "max-w-56 self-center sm:w-40 sm:self-auto",
  "1:1": "max-w-72 self-center sm:w-56 sm:self-auto",
  "16:9": "sm:w-80",
};

const FORMAT_ICON: Record<AspectRatio, LucideIcon> = {
  "9:16": RectangleVertical,
  "1:1": Square,
  "16:9": RectangleHorizontal,
};

// Réglage d'une création, avec son icône ; `accent` pour les options.
function Chip({ icon: Icon, accent, children }: { icon: LucideIcon; accent?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
        accent ? "border-accent/30 bg-accent-soft text-accent-light" : "border-line bg-surface-2 text-muted"
      }`}
    >
      <Icon className={`size-3.5 ${accent ? "" : "text-faint"}`} />
      {children}
    </span>
  );
}

export function HistoryList({ items }: { items: SwapHistoryItem[] }) {
  const { t } = useI18n();
  const V = t.videos;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="panel relative flex animate-fade-up flex-col gap-4 p-3 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong sm:flex-row"
        >
          <div
            className={`flex w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-black bg-clip-padding ${THUMB_WIDTH[item.aspectRatio]}`}
            style={{ aspectRatio: item.aspectRatio.replace(":", " / ") }}
          >
            {item.mediaUrl ? (
              <video
                // #t= : la première image s'affiche avant la lecture.
                src={`${item.mediaUrl}#t=0.1`}
                controls
                preload="metadata"
                playsInline
                className="size-full object-contain"
              />
            ) : (
              <span className="flex flex-col items-center gap-3 text-sm text-muted">
                <span className="size-7 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                {V.running}
              </span>
            )}
          </div>

          <DeleteButton
            id={item.id}
            confirm={V.deleteConfirm}
            className="absolute top-2 right-2 z-10 size-8 text-faint hover:bg-red-500/15 hover:text-red-400"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3 py-1 sm:pr-8">
            {item.thumbs.length > 0 && (
              <div className="flex gap-2">
                {item.thumbs.map((src) => (
                  // URL signée Supabase : pas d'optimisation Next.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="size-14 rounded-xl border border-line object-cover transition-transform duration-200 hover:scale-105"
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Chip icon={MonitorPlay}>{item.hd ? "1080p" : "720p"}</Chip>
              {item.seconds ? <Chip icon={Clock}>{fmt(V.seconds, { seconds: item.seconds })}</Chip> : null}
              <Chip icon={FORMAT_ICON[item.aspectRatio]}>{item.aspectRatio}</Chip>
              {item.transfer && (
                <Chip icon={Move} accent>
                  {t.studio.modeTransfer}
                </Chip>
              )}
              {item.fidelity && (
                <Chip icon={Layers} accent>
                  {t.studio.methodFidelity}
                </Chip>
              )}
            </div>
            {item.incomplete && (
              <p className="inline-flex items-center gap-1.5 self-start rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                <TriangleAlert className="size-3.5" />
                {item.incomplete}
              </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <span className="flex items-center gap-1.5 text-xs text-faint tabular-nums">
                <CalendarDays className="size-3.5" />
                {item.date}
              </span>
              {item.running ? (
                <Link href={`/dashboard/generate?v=${item.id}`} className="btn btn-accent">
                  {V.resume}
                </Link>
              ) : (
                <a href={item.downloadUrl ?? item.mediaUrl} className="btn btn-hot">
                  <Download />
                  {V.download}
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Démo du studio tant que l'historique est vide : les quatre étapes jouées en
// boucle avec un vrai remplacement (clip d'origine, personnage, rendu).
const DEMO_MS = [2600, 2600, 2400, 5600];
const DEMO = {
  before: "/examples/micro-avant",
  after: "/examples/micro-apres",
  character: "/examples/micro-perso.jpg",
};

const reducedMotion = {
  query: () => window.matchMedia("(prefers-reduced-motion: reduce)"),
  subscribe(onChange: () => void) {
    const query = reducedMotion.query();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  },
};

// Tuile vide de la démo, comme celles du studio.
function DemoEmpty({ icons }: { icons: LucideIcon[] }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="flex -space-x-2">
        {icons.map((Icon, i) => (
          <span
            key={i}
            className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-gradient-to-b from-surface-3 to-surface-2 text-muted ring-2 ring-surface"
          >
            <Icon className="size-4" />
          </span>
        ))}
      </span>
    </span>
  );
}

export function HistoryEmpty() {
  const { t } = useI18n();
  const D = t.studio.demo;
  const reduced = useSyncExternalStore(reducedMotion.subscribe, () => reducedMotion.query().matches, () => false);
  const [{ step, cycle }, setDemo] = useState({ step: 0, cycle: 0 });
  // Mouvement réduit : la démo reste sur son résultat.
  const shown = reduced ? 3 : step;
  const root = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLVideoElement>(null);
  const result = useRef<HTMLVideoElement>(null);
  usePauseWhenHidden(root);

  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(
      () => setDemo((d) => (d.step === 3 ? { step: 0, cycle: d.cycle + 1 } : { ...d, step: d.step + 1 })),
      DEMO_MS[step],
    );
    return () => clearTimeout(id);
  }, [step, reduced]);

  // Le rendu apparaît calé sur le clip d'origine : mêmes gestes côte à côte.
  useEffect(() => {
    const video = result.current;
    if (shown !== 3 || !video) return;
    video.currentTime = clip.current?.currentTime ?? 0;
    video.play().catch(() => {});
  }, [shown, cycle]);

  const drop = reduced ? "" : "animate-demo-drop";
  const visual = (i: number) => {
    if (i === 0) {
      return (
        <>
          <DemoEmpty icons={[Video]} />
          <video
            ref={clip}
            key={`clip-${cycle}`}
            src={`${DEMO.before}.mp4`}
            poster={`${DEMO.before}.jpg`}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-hidden
            className={`absolute inset-0 size-full object-cover ${drop}`}
          />
        </>
      );
    }
    if (i === 1) {
      return shown >= 1 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`character-${cycle}`}
          src={DEMO.character}
          alt=""
          className={`absolute inset-0 size-full object-cover ${drop}`}
        />
      ) : (
        <DemoEmpty icons={[UserRound, PawPrint, Ghost]} />
      );
    }
    if (i === 2) {
      return (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4">
          <span
            className={`btn btn-accent pointer-events-none transition-transform duration-150 ${
              shown === 2 ? "translate-y-0.5" : ""
            }`}
          >
            <WandSparkles />
            {t.studio.launch}
          </span>
          <span className="h-1 w-3/4 overflow-hidden rounded-full bg-surface-3">
            <span
              key={`progress-${cycle}-${shown}`}
              className={`block h-full origin-left rounded-full bg-accent ${
                shown === 2 ? "animate-feature-progress" : shown === 3 ? "" : "scale-x-0"
              }`}
              style={shown === 2 ? { animationDuration: `${DEMO_MS[2]}ms` } : undefined}
            />
          </span>
        </span>
      );
    }
    return (
      <>
        <DemoEmpty icons={[Film]} />
        <video
          ref={result}
          src={`${DEMO.after}.mp4`}
          poster={`${DEMO.after}.jpg`}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          aria-hidden
          className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${
            shown === 3 ? "opacity-100" : "opacity-0"
          }`}
        />
      </>
    );
  };

  return (
    <div ref={root} className="panel animate-fade-up p-5">
      <p className="text-sm text-muted">{t.studio.historyEmpty}</p>
      <p className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-accent-light">
        <CirclePlay className="size-3.5" />
        {D.title}
      </p>
      <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {D.steps.map((s, i) => {
          const active = shown === i;
          return (
            <li key={s.title} className={`transition-opacity duration-300 ${active || reduced ? "" : "opacity-55"}`}>
              <div
                className={`relative aspect-[9/16] overflow-hidden rounded-xl border bg-surface-2/40 bg-clip-padding transition-colors duration-300 ${
                  active ? "border-accent/60" : i === 2 ? "border-line" : "border-dashed border-line-strong"
                }`}
              >
                {visual(i)}
              </div>
              <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] tabular-nums transition-colors duration-300 ${
                    active ? "bg-accent text-white" : "bg-surface-3 text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                {s.title}
              </p>
              <p className="mt-0.5 pl-7 text-xs text-muted">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
