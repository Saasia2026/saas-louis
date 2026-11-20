"use client";

import { CalendarClock, Clapperboard, Coins, Film, ScanFace, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import b from "./bottom-nav.module.css";
import sn from "./side-nav.module.css";

const NAV_LINKS: {
  href: string;
  key: "studio" | "influencer" | "videos" | "planning" | "credits";
  icon: LucideIcon;
}[] = [
  { href: "/dashboard/generate", key: "studio", icon: Clapperboard },
  { href: "/dashboard/influencer", key: "influencer", icon: ScanFace },
  { href: "/dashboard/videos", key: "videos", icon: Film },
  { href: "/dashboard/planning", key: "planning", icon: CalendarClock },
  { href: "/dashboard/credits", key: "credits", icon: Coins },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.startsWith(href);
}

// Navigation de la barre du haut (écrans larges) : une icône et le nom par
// entrée (le nom à partir de 1280 px : en dessous, les six noms débordent
// sous le solde ; l'explication en infobulle).
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
        className="absolute inset-y-0 left-0 rounded-full bg-white opacity-0 transition-[transform,width,opacity] duration-300 [transition-timing-function:var(--ease-out)]"
      />
      {NAV_LINKS.map(({ href, key }, i) => {
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
            className={`relative flex items-center rounded-full px-3 py-2 transition-colors duration-300 ${
              active ? "text-black" : "text-muted hover:text-text"
            }`}
          >
            {/* Comme la barre du bas : les noms seuls, sans icône. */}
            <span className="text-sm font-semibold whitespace-nowrap">{t.shell.nav[key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// Menu latéral (grands écrans), au style de la landing : le nom en toutes
// lettres, les pages en grands noms numérotés, la page ouverte dans une
// pastille blanche qui glisse jusqu'à l'entrée cliquée.
export function SideNav() {
  const isActive = useActive();
  const { t } = useI18n();
  const activeIndex = NAV_LINKS.findIndex((l) => isActive(l.href));
  const [clicked, setClicked] = useState<number | null>(null);
  const current = clicked !== null && clicked !== activeIndex ? clicked : activeIndex;
  return (
    <aside className={sn.aside}>
      <Link href="/dashboard" className={sn.brand}>
        TwinPost
      </Link>
      <nav className={sn.nav}>
        <span
          aria-hidden
          className={sn.thumb}
          style={{ transform: `translateY(${Math.max(0, current) * 100}%)`, opacity: current < 0 ? 0 : 1 }}
        />
        {NAV_LINKS.map(({ href, key }, i) => (
          <Link
            key={href}
            href={href}
            onClick={() => setClicked(i)}
            aria-current={i === activeIndex ? "page" : undefined}
            title={t.shell.navHint[key]}
            className={`${sn.item} ${i === current ? sn.active : ""}`}
          >
            <span className={sn.num}>{String(i + 1).padStart(2, "0")}</span>
            {t.shell.nav[key]}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

// Barre d'onglets du bas (téléphone) : une pilule de verre flottante, les
// cinq pages à portée de pouce, en toutes lettres (sans icônes). La pastille blanche de la page ouverte
// glisse jusqu'à l'onglet touché dès le toucher, avec la courbe de la
// landing, puis la page suit.
export function BottomNav() {
  const isActive = useActive();
  const { t } = useI18n();
  const activeIndex = NAV_LINKS.findIndex((l) => isActive(l.href));
  const [tapped, setTapped] = useState<number | null>(null);
  // Une fois la page arrivée, c'est elle qui fait foi.
  const current = tapped !== null && tapped !== activeIndex ? tapped : activeIndex;
  const n = NAV_LINKS.length;

  return (
    <div className={`${b.wrap} md:hidden`}>
      <nav className={b.bar} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span
          aria-hidden
          className={b.thumb}
          style={{
            width: `calc((100% - 10px) / ${n})`,
            transform: `translateX(${Math.max(0, current) * 100}%)`,
            opacity: current < 0 ? 0 : 1,
          }}
        />
        {NAV_LINKS.map(({ href, key }, i) => (
          <Link
            key={href}
            href={href}
            onClick={() => setTapped(i)}
            aria-current={i === activeIndex ? "page" : undefined}
            className={`${b.item} ${i === current ? b.active : ""}`}
          >
            <span>{t.shell.nav[key]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
