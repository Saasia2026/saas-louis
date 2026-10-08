"use client";

import {
  CalendarDays,
  Clock,
  Download,
  Layers,
  MonitorPlay,
  Move,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { AspectRatio } from "@/lib/generation";
import type { SwapHistoryItem } from "../swap-history";
import { DeleteButton } from "../videos/delete-button";

// Exemples montrés tant que l'historique est vide.
const EXAMPLES = [
  { src: "/examples/genjutsu-diable.mp4", poster: "/examples/genjutsu-diable.jpg", aspectRatio: "9:16" },
  { src: "/examples/genjutsu-lincoln.mp4", poster: "/examples/genjutsu-lincoln.jpg", aspectRatio: "9:16" },
  { src: "/examples/genjutsu-cage.mp4", poster: "/examples/genjutsu-cage.jpg", aspectRatio: "9:16" },
] as const;

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

export function HistoryEmpty() {
  const { t } = useI18n();
  return (
    <div className="panel animate-fade-up p-5">
      <p className="text-sm text-muted">{t.studio.historyEmpty}</p>
      <p className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-accent-light">
        <Sparkles className="size-3.5" />
        {t.studio.examplesTitle}
      </p>
      <div className="mt-3 grid grid-cols-3 items-start gap-3">
        {EXAMPLES.map((ex) => (
          <video
            key={ex.src}
            src={ex.src}
            poster={ex.poster}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-hidden
            className="w-full rounded-xl border border-line bg-black bg-clip-padding object-cover"
            style={{ aspectRatio: ex.aspectRatio.replace(":", " / ") }}
          />
        ))}
      </div>
    </div>
  );
}
