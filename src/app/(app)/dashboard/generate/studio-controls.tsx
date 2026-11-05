"use client";

import { Check, ChevronRight, Move, Replace, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { Space_Grotesk } from "next/font/google";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useI18n } from "@/i18n/provider";
import type { GenjutsuModel } from "@/lib/generation";

// Nom du modèle sur sa carte.
const modelNameFont = Space_Grotesk({ subsets: ["latin"], weight: "700" });

// Commandes du panneau de création : la carte du modèle, les deux modes, et
// les lignes de réglage dont le menu s'ouvre à côté du panneau.

// Menu ancré à un élément : à droite de celui-ci sur grand écran (par-dessus
// la colonne de droite), dessous sur mobile. Rendu dans <body> en position
// fixe : ni rogné par le défilement du panneau, ni décalé par ses
// animations (un ancêtre transformé fausserait la position fixe). Il se
// ferme au clic dehors, à Échap et au défilement de la page.
export function Popover({
  anchor,
  open,
  onClose,
  children,
  width = 288,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const at = anchor.current?.getBoundingClientRect();
    if (!at) return;
    const gap = 8;
    const height = box.current?.offsetHeight ?? 0;
    const side = window.innerWidth >= 1024 && at.right + gap + width <= window.innerWidth - gap;
    const top = side
      ? Math.max(gap, Math.min(at.top, window.innerHeight - height - gap))
      : Math.min(at.bottom + gap, window.innerHeight - height - gap);
    const left = side ? at.right + gap : Math.max(gap, Math.min(at.left, window.innerWidth - width - gap));
    setPlace({ top, left });
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={box}
      role="dialog"
      style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, width }}
      className="fixed z-50 max-h-[min(28rem,calc(100dvh-1rem))] animate-fade-up overflow-y-auto rounded-2xl border border-line-strong bg-surface p-1.5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.55)]"
    >
      {children}
    </div>,
    document.body,
  );
}

// Ligne de réglage : son nom en petit, la valeur choisie dessous, une flèche.
// Un clic ouvre le menu de ses choix.
export function SettingRow({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  // Contenu du menu ; `close` le referme après un choix.
  children: (close: () => void) => React.ReactNode;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
          open ? "border-line-strong bg-surface-2" : "border-line bg-surface-2/60 hover:border-line-strong hover:bg-surface-2"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-faint">{label}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">{value}</span>
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-faint transition-transform duration-200 ${open ? "translate-x-0.5" : ""}`}
        />
      </button>
      <Popover anchor={anchor} open={open} onClose={close}>
        {children(close)}
      </Popover>
    </>
  );
}

// Choix d'un menu : titre, détails, prix à droite, coche s'il est retenu.
export function Option({
  selected,
  onSelect,
  icon: Icon,
  title,
  badge,
  detail,
  aside,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: LucideIcon;
  title: string;
  badge?: string;
  detail?: React.ReactNode;
  aside?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-surface-2" : "hover:bg-surface-2/70"
      }`}
    >
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
          <Icon className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          {badge && <ModelBadge>{badge}</ModelBadge>}
        </span>
        {detail && <span className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 text-xs text-muted tabular-nums">{aside}</span>}
      <Check className={`size-4 shrink-0 text-accent-light ${selected ? "" : "invisible"}`} />
    </button>
  );
}

export function ModelBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-accent-soft px-1.5 py-px text-[0.6875rem] font-semibold text-accent-light">
      {children}
    </span>
  );
}

// Petite étiquette grise dans le détail d'un choix (résolution, durée).
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-line px-1.5 py-px text-[0.6875rem] tabular-nums">{children}</span>
  );
}

export const MODEL_ICON: Record<GenjutsuModel, LucideIcon> = { standard: Zap, max: Sparkles };

// Carte du modèle en tête du panneau : un rendu en boucle, son nom en
// grand, et « Changer » pour ouvrir la liste des modèles.
export function ModelCard({
  name,
  tagline,
  changeLabel,
  children,
}: {
  name: string;
  tagline: string;
  changeLabel: string;
  // Menu des modèles ; `close` le referme après un choix.
  children: (close: () => void) => React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  usePauseWhenHidden(box);
  return (
    <div
      ref={box}
      className="relative isolate h-36 overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding"
    >
      <video
        src="/examples/shinka-card.mp4"
        poster="/examples/shinka-card.jpg"
        muted
        loop
        playsInline
        webkit-playsinline=""
        disablePictureInPicture
        disableRemotePlayback
        preload="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-[50%_30%]"
      />
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/10" />
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/75"
      >
        {changeLabel}
      </button>
      <div className="@container absolute inset-x-0 bottom-0 p-4">
        <p className="text-[0.6875rem] font-semibold text-white/70">{t.studio.poweredByLabel}</p>
        <p
          className={`${modelNameFont.className} text-[9.2cqw] leading-none tracking-tight whitespace-nowrap text-[#b4a3ff] uppercase [text-shadow:0_1px_6px_rgb(0_0_0_/_0.7)]`}
        >
          TwinPost {name}
        </p>
        <p className="mt-1 text-xs text-white/75">{tagline}</p>
      </div>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={320}>
        {children(() => setOpen(false))}
      </Popover>
    </div>
  );
}

export type StudioMode = "replace" | "transfer";

const MODE_PREVIEW: Record<StudioMode, { video: string; icon: LucideIcon }> = {
  replace: { video: "/examples/genjutsu-cage", icon: Replace },
  transfer: { video: "/examples/genjutsu-danse", icon: Move },
};

// Les deux modes, côte à côte. Au survol (ou au focus), une carte montre ce
// que fait le mode, avec un de ses rendus.
export function ModeTabs({
  value,
  onChange,
  labels,
}: {
  value: StudioMode;
  onChange: (mode: StudioMode) => void;
  labels: Record<StudioMode, { title: string; hint: string }>;
}) {
  const [hover, setHover] = useState<StudioMode | null>(null);
  return (
    <div role="tablist" className="relative grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2/60 p-1">
      {/* Fond de l'onglet actif : il glisse d'un onglet à l'autre. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-lg border border-line-strong thumb transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
        style={{ transform: value === "transfer" ? "translateX(calc(100% + 0.25rem))" : undefined }}
      />
      {(["replace", "transfer"] as const).map((m) => {
        const { icon: Icon, video } = MODE_PREVIEW[m];
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={value === m}
            onClick={() => onChange(m)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(m)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(m)}
            onBlur={() => setHover(null)}
            className={`relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
              value === m ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            <Icon className={`size-4 shrink-0 transition-colors ${value === m ? "text-accent-light" : ""}`} />
            <span className="truncate">{labels[m].title}</span>
            {hover === m && (
              <span
                role="tooltip"
                className={`pointer-events-none absolute top-full z-40 mt-2 w-60 animate-fade-up ${m === "replace" ? "left-0" : "right-0"} overflow-hidden rounded-xl border border-line-strong bg-surface text-left shadow-[0_20px_50px_-12px_rgb(0_0_0/0.6)]`}
              >
                <video
                  src={`${video}.mp4`}
                  poster={`${video}.jpg`}
                  autoPlay
                  muted
                  loop
                  playsInline
                  webkit-playsinline=""
                  aria-hidden
                  className="aspect-video w-full bg-black object-cover"
                />
                <span className="block px-3 pt-2.5 pb-3">
                  <span className="block text-sm font-semibold text-text">{labels[m].title}</span>
                  <span className="mt-0.5 block text-xs leading-snug font-normal text-muted">{labels[m].hint}</span>
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Onglets de la colonne de droite.
export function PanelTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (tab: T) => void;
  tabs: { value: T; label: string; icon: LucideIcon }[];
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {tabs.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            value === v ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
          }`}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
