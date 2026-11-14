"use client";

import { CalendarClock, Clapperboard, Coins, Film, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/i18n/provider";

const NAV_LINKS: {
  href: string;
  key: "studio" | "videos" | "planning" | "credits";
  icon: LucideIcon;
}[] = [
  { href: "/dashboard/generate", key: "studio", icon: Clapperboard },
  { href: "/dashboard/videos", key: "videos", icon: Film },
  { href: "/dashboard/planning", key: "planning", icon: CalendarClock },
  { href: "/dashboard/credits", key: "credits", icon: Coins },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

// Navigation de la barre du haut (écrans larges) : une icône et le nom par
// entrée (le nom à partir des écrans larges, l'explication en infobulle).
// La pastille de l'entrée active glisse de l'une à l'autre ; les entrées
// n'ayant pas la même largeur, elle est mesurée sur la page.
export function MainNav() {
  const isActive = useActive();
  const { t } = useI18n();
  const activeIndex = NAV_LINKS.findIndex((l) => isActive(l.href));
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const pill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const el = pill.current;
    if (!el) return;
    const place = () => {
      const link = links.current[activeIndex];
      el.style.opacity = link ? "1" : "0";
      if (!link) return;
      el.style.width = `${link.offsetWidth}px`;
      el.style.transform = `translateX(${link.offsetLeft}px)`;
    };
    // Première pose sans glissement ; ensuite, il glisse.
    if (!placed.current) {
      el.style.transition = "none";
      place();
      void el.offsetWidth;
      el.style.transition = "";
      placed.current = true;
    } else {
      place();
    }
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [activeIndex, t]);

  return (
    <nav className="relative flex items-center gap-0.5">
      <span
        ref={pill}
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-surface-3 opacity-0 transition-[transform,width,opacity] duration-300 [transition-timing-function:var(--ease-out)]"
      />
      {NAV_LINKS.map(({ href, key, icon: Icon }, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={href}
            ref={(node) => {
              links.current[i] = node;
            }}
            href={href}
            title={t.shell.navHint[key]}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-2 rounded-full px-3 py-2 transition-colors lg:px-3.5 ${
              active ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            <Icon className={`size-4 shrink-0 transition-colors ${active ? "text-accent-light" : ""}`} />
            <span className="hidden text-sm font-medium whitespace-nowrap lg:inline">{t.shell.nav[key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// Pastille d'un onglet du bas : allumée pour la page ouverte, et dès le
// toucher pour celle qui se charge.
function TabIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-100 ${
        active || pending ? "bg-accent/20 text-accent-light" : ""
      }`}
    >
      <Icon className="size-[1.125rem]" />
    </span>
  );
}

// Barre d'onglets du bas (téléphone) : les cinq entrées toujours visibles,
// à portée de pouce, au-dessus de la zone du geste d'accueil.
export function BottomNav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${NAV_LINKS.length}, minmax(0, 1fr))` }}
    >
      {NAV_LINKS.map(({ href, key, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[0.6875rem] font-medium ${
              active ? "text-text" : "text-muted"
            }`}
          >
            <TabIcon icon={Icon} active={active} />
            <span className="max-w-full truncate">{t.shell.nav[key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
