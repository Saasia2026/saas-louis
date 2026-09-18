"use client";

import { Clapperboard, Coins, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";

const NAV_LINKS: { href: string; key: "studio" | "characters" | "credits"; icon: LucideIcon }[] = [
  { href: "/dashboard/generate", key: "studio", icon: Clapperboard },
  { href: "/dashboard/characters", key: "characters", icon: Users },
  { href: "/dashboard/credits", key: "credits", icon: Coins },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

// Navigation de la barre latérale (écrans larges).
export function SidebarNav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_LINKS.map(({ href, key, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-surface-3 text-text"
                : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            {active && (
              <span className="absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
            )}
            <Icon
              className={`size-4 transition-colors ${active ? "text-accent-light" : "text-faint group-hover:text-muted"}`}
            />
            {t.shell.nav[key]}
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
