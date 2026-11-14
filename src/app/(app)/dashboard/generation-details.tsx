"use client";

import { Check, Copy, Play } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Modal, ModalClose } from "./generate/media-library";
import type { SwapHistoryItem } from "./swap-history";

// Copie un texte ; une coche le confirme une seconde et demie.
export function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? t.studio.copied : label}
      onClick={async () => {
        const done = await navigator.clipboard.writeText(text).then(
          () => true,
          () => {
            // Presse-papiers refusé (navigateur intégré d'une appli…) :
            // ancienne méthode, par un champ caché.
            const area = document.createElement("textarea");
            area.value = text;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand("copy");
            area.remove();
            return ok;
          },
        );
        if (!done) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-text ${className}`}
    >
      {copied ? <Check className="size-4 text-accent-light" /> : <Copy className="size-4" />}
    </button>
  );
}

// Le prompt d'un rendu, tel que le créateur l'a écrit, les @image1… en couleur.
export function PromptText({ prompt }: { prompt: string }) {
  const { t } = useI18n();
  if (!prompt.trim()) return <p className="text-[0.9375rem] text-faint">{t.studio.noPrompt}</p>;
  return (
    <p className="max-h-40 overflow-y-auto text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-muted">
      {prompt.split(/(@(?:image\d+|video)\b)/gi).map((part, i) =>
        i % 2 ? (
          <span key={i} className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-light">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

type Shown = { kind: "video" | "image"; url: string; label: string };

// Les références d'un rendu : le clip envoyé, puis les images dans l'ordre
// du prompt et la photo du lieu. Un clic ouvre la référence en grand.
export function RefStrip({ item }: { item: Pick<SwapHistoryItem, "clip" | "refs" | "decor"> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Shown | null>(null);
  const shown: Shown[] = [
    ...(item.clip ? [{ kind: "video" as const, url: item.clip.url, label: t.studio.refClip }] : []),
    ...item.refs.map((r, i) => ({ kind: "image" as const, url: r.url, label: `@image${i + 1}` })),
    ...(item.decor ? [{ kind: "image" as const, url: item.decor.url, label: t.studio.refDecor }] : []),
  ];
  if (!shown.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {shown.map((ref) => (
          <button
            key={`${ref.kind}-${ref.url}`}
            type="button"
            aria-label={ref.label}
            title={ref.label}
            onClick={() => setOpen(ref)}
            className="group relative size-16 shrink-0 overflow-hidden rounded-2xl bg-black ring-1 ring-line transition-shadow duration-200 hover:ring-line-strong"
          >
            {ref.kind === "video" ? (
              <>
                <video
                  src={`${ref.url}#t=0.1`}
                  muted
                  playsInline
                  webkit-playsinline=""
                  preload="metadata"
                  disablePictureInPicture
                  disableRemotePlayback
                  className="pointer-events-none size-full object-cover"
                />
                <span className="absolute inset-0 m-auto flex size-6 items-center justify-center rounded-full bg-black/55 text-white">
                  <Play className="size-3 translate-x-px fill-current" />
                </span>
              </>
            ) : (
              // URL signée Supabase : pas d'optimisation Next.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ref.url}
                alt={ref.label}
                loading="lazy"
                className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            )}
          </button>
        ))}
      </div>

      {open && (
        <Modal label={open.label} onClose={() => setOpen(null)} className="sm:w-auto sm:max-w-3xl">
          <header className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="text-sm font-semibold">{open.label}</h2>
            <ModalClose onClose={() => setOpen(null)} />
          </header>
          <div className="flex min-h-0 items-center justify-center bg-black">
            {open.kind === "video" ? (
              <video src={open.url} controls autoPlay playsInline className="max-h-[75dvh] max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url} alt={open.label} className="max-h-[75dvh] max-w-full object-contain" />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
