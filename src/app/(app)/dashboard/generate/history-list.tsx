"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { AspectRatio } from "@/lib/generation";
import type { SwapHistoryItem } from "../swap-history";

// Exemples rendus avec Genjutsu, montrés tant que l'historique est vide.
const EXAMPLES = [
  { src: "/examples/genjutsu-plage.mp4", poster: "/examples/genjutsu-plage.jpg", aspectRatio: "9:16" },
  { src: "/examples/genjutsu-lincoln.mp4", poster: "/examples/genjutsu-lincoln.jpg", aspectRatio: "9:16" },
  { src: "/examples/genjutsu-dieux.mp4", poster: "/examples/genjutsu-dieux.jpg", aspectRatio: "1:1" },
] as const;

// Largeur de la vignette selon le format : même hauteur à peu près pour tous,
// et sur mobile une vidéo verticale ne prend pas tout l'écran.
const THUMB_WIDTH: Record<AspectRatio, string> = {
  "9:16": "max-w-56 self-center sm:w-40 sm:self-auto",
  "1:1": "max-w-72 self-center sm:w-56 sm:self-auto",
  "16:9": "sm:w-80",
};

export function HistoryList({ items }: { items: SwapHistoryItem[] }) {
  const { t } = useI18n();
  const V = t.videos;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="panel flex animate-fade-up flex-col gap-4 p-3 sm:flex-row">
          <div
            className={`flex w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-black ${THUMB_WIDTH[item.aspectRatio]}`}
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

          <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
            <p className="text-xs font-medium text-muted">Higgsfield Genjutsu</p>
            {item.thumbs.length > 0 && (
              <div className="flex gap-2">
                {item.thumbs.map((src) => (
                  // URL signée Supabase : pas d'optimisation Next.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="size-12 rounded-lg border border-line object-cover"
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <span className="tag">{item.hd ? "1080p" : "720p"}</span>
              {item.seconds ? <span className="tag">{fmt(V.seconds, { seconds: item.seconds })}</span> : null}
              <span className="tag">{item.aspectRatio}</span>
              {item.transfer && <span className="tag">{t.studio.modeTransfer}</span>}
              {item.fidelity && <span className="tag">{t.studio.methodFidelity}</span>}
            </div>
            {item.incomplete && <p className="text-xs text-amber-300">{item.incomplete}</p>}

            <div className="mt-auto flex items-center justify-between gap-3">
              <span className="text-xs text-faint tabular-nums">{item.date}</span>
              {item.running ? (
                <Link href={`/dashboard/generate?v=${item.id}`} className="btn btn-secondary">
                  {V.resume}
                </Link>
              ) : (
                <a href={item.downloadUrl ?? item.mediaUrl} className="btn btn-ghost">
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
      <p className="mt-5 text-xs font-medium text-faint">{t.studio.examplesTitle}</p>
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
            className="w-full rounded-xl border border-line bg-black object-cover"
            style={{ aspectRatio: ex.aspectRatio.replace(":", " / ") }}
          />
        ))}
      </div>
    </div>
  );
}
