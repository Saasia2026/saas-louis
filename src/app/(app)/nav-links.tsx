"use client";

import { CalendarClock, Clapperboard, Coins, Film, TrendingUp, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/i18n/provider";

const NAV_LINKS: {
  href: string;
  key: "studio" | "videos" | "planning" | "viral" | "credits";
  icon: LucideIcon;
}[] = [
  { href: "/dashboard/generate", key: "studio", icon: Clapperboard },
  { href: "/dashboard/videos", key: "videos", icon: Film },
  { href: "/dashboard/planning", key: "planning", icon: CalendarClock },
  { href: "/dashboard/viral", key: "viral", icon: TrendingUp },
  { href: "/dashboard/credits", key: "credits", icon: Coins },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

// Navigation de la barre du haut (écrans larges) : une tuile d'icône et le
// nom par entrée (le nom à partir des écrans larges, l'explication en
// infobulle). Le fond de l'entrée active glisse de l'une à l'autre ; les
// entrées n'ayant pas la même largeur, il est mesuré sur la page.
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
    <nav className="relative flex items-center gap-1">
      <span
        ref={pill}
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-xl border border-line bg-surface-3 opacity-0 transition-[transform,width,opacity] duration-300 [transition-timing-function:var(--ease-out)]"
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
            className={`group relative flex items-center gap-2.5 rounded-xl p-1.5 transition-colors xl:pr-3.5 ${
              active ? "text-text" : "text-muted hover:bg-surface-2/70 hover:text-text"
            }`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-[background-color,border-color,color,transform] duration-200 group-hover:-translate-y-0.5 ${
                active
                  ? "border-transparent bg-gradient-to-b from-accent-2 to-accent text-white"
                  : "border-line bg-surface-2 text-faint group-hover:border-line-strong group-hover:text-text"
              }`}
              style={active ? { boxShadow: "0 3px 0 color-mix(in oklab, var(--accent) 62%, black)" } : undefined}
            >
              <Icon className="size-4" />
            </span>
            <span className="hidden text-sm font-semibold whitespace-nowrap xl:inline">{t.shell.nav[key]}</span>
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
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
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
