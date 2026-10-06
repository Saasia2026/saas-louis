"use client";

import { Clapperboard, Coins, Film, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";

const NAV_LINKS: { href: string; key: "studio" | "videos" | "credits"; icon: LucideIcon }[] = [
  { href: "/dashboard/generate", key: "studio", icon: Clapperboard },
  { href: "/dashboard/videos", key: "videos", icon: Film },
  { href: "/dashboard/credits", key: "credits", icon: Coins },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

// Hauteur d'une entrée et écart entre deux (h-14, gap-1) : le fond de
// l'entrée active glisse de l'une à l'autre de ce pas.
const ITEM_PX = 56;
const GAP_PX = 4;

// Navigation de la barre latérale (écrans larges) : une tuile d'icône, le
// nom et une ligne d'explication par entrée.
export function SidebarNav() {
  const isActive = useActive();
  const { t } = useI18n();
  const activeIndex = NAV_LINKS.findIndex((l) => isActive(l.href));
  return (
    <nav className="relative flex flex-col gap-1">
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-14 rounded-xl border border-line bg-surface-3 transition-[transform,opacity] duration-300 [transition-timing-function:var(--ease-out)] ${
          activeIndex < 0 ? "opacity-0" : ""
        }`}
        style={{ transform: `translateY(${Math.max(activeIndex, 0) * (ITEM_PX + GAP_PX)}px)` }}
      />
      {NAV_LINKS.map(({ href, key, icon: Icon }, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex h-14 items-center gap-3 rounded-xl px-2.5 transition-colors ${
              active ? "text-text" : "text-muted hover:bg-surface-2/70 hover:text-text"
            }`}
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-[background-color,border-color,color,transform] duration-200 group-hover:-translate-y-0.5 ${
                active
                  ? "border-transparent bg-gradient-to-b from-accent-2 to-accent text-white"
                  : "border-line bg-surface-2 text-faint group-hover:border-line-strong group-hover:text-text"
              }`}
              style={active ? { boxShadow: "0 3px 0 color-mix(in oklab, var(--accent) 62%, black)" } : undefined}
            >
              <Icon className="size-[1.1rem]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{t.shell.nav[key]}</span>
              <span className="block truncate text-xs text-faint">{t.shell.navHint[key]}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// Onglets horizontaux (mobile).
export function TopNav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {NAV_LINKS.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
            isActive(href) ? "bg-surface-3 text-text" : "text-muted"
          }`}
        >
          <Icon className="size-4" />
          {t.shell.nav[key]}
        </Link>
      ))}
    </nav>
  );
}

// Fil d'Ariane de la barre du haut.
export function Breadcrumb() {
  const isActive = useActive();
  const { t } = useI18n();
  const current = NAV_LINKS.find((l) => isActive(l.href));
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="text-faint">{t.shell.workspace}</span>
      <span className="text-faint">/</span>
      <span className="font-medium text-text">{t.shell.nav[current?.key ?? "studio"]}</span>
    </p>
  );
}
