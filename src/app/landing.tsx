"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LanguageSwitcher } from "@/app/language-switcher";
import s from "./landing.module.css";

// Landing plein cadre : quatre écrans (accueil, exemples, comment ça marche,
// tarifs), chacun sur sa vidéo pleine page. La vidéo est horizontale sur un
// écran large, verticale sur un écran en hauteur (téléphone), et rebascule si
// on tourne l'appareil. Molette, flèches, glisser du doigt, menu et frise
// changent d'écran ; la frise avance toute seule toutes les 9 s, en pause au
// survol d'une carte ou d'un bouton.

export type LandingPack = {
  id: string;
  credits: string;
  price: string;
  perEuro: string;
  bonus: string | null;
  tagline: string;
  featured: boolean;
};

export type LandingCopy = {
  home: string;
  examples: string;
  howItWorks: string;
  pricing: string;
  signIn: string;
  start: string;
  eyebrow: string;
  titleTop: string;
  titleBottom: string;
  heroText: string;
  ctaFirst: string;
  seeExamples: string;
  perks: string[];
  examplesTop: string;
  examplesBottom: string;
  examplesText: string;
  compareBefore: string;
  compareAfter: string;
  featuresTop: string;
  featuresBottom: string;
  steps: { title: string; text: string }[];
  finalTop: string;
  finalBottom: string;
  popular: string;
  subsBefore: string;
  subsOff: string;
  subsAfter: string;
  allPrices: string;
  terms: string;
  nextScreen: string;
};

type Props = {
  copy: LandingCopy;
  packs: LandingPack[];
  studioHref: string;
  startHref: string;
  creditsHref: string;
  loggedIn: boolean;
};

// Fond de chaque écran : vidéo horizontale (h) et verticale (v), sans extension.
const BACKGROUNDS = [
  { h: "/demos/demo-21", v: "/examples/gallery/g-105" },
  { h: "/demos/demo-17", v: "/examples/gallery/g-100" },
  { h: "/demos/demo-09", v: "/examples/gallery/g-24" },
  { h: "/demos/demo-20", v: "/demos/demo-07" },
];

const SLIDE_MS = 9000;
const REVEAL_MS = 1300;
const TALL = "(max-aspect-ratio: 4/5)";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function play(el: HTMLElement | null, on: boolean) {
  el?.querySelectorAll("video").forEach((v) => {
    if (on) {
      v.muted = true;
      v.play().catch(() => {});
    } else v.pause();
  });
}

export function Landing({ copy: c, packs, studioHref, startHref, creditsHref, loggedIn }: Props) {
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [origin, setOrigin] = useState({ x: "92%", y: "92%" });
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tall, setTall] = useState(false);
  const bgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const curRef = useRef(0);

  // Orientation des vidéos de fond.
  useEffect(() => {
    const q = window.matchMedia(TALL);
    const sync = () => setTall(q.matches);
    sync();
    q.addEventListener("change", sync);
    // Laisse le premier rendu s'afficher, puis lance l'entrée des textes.
    const id = requestAnimationFrame(() => setReady(true));
    return () => {
      q.removeEventListener("change", sync);
      cancelAnimationFrame(id);
    };
  }, []);

  const go = useCallback((i: number, from?: Element | null) => {
    const n = BACKGROUNDS.length;
    const to = ((i % n) + n) % n;
    if (to === curRef.current || lock.current) return;
    lock.current = true;
    window.setTimeout(() => (lock.current = false), REVEAL_MS - 150);
    const r = (from ?? nextRef.current)?.getBoundingClientRect();
    if (r) setOrigin({ x: `${((r.left + r.width / 2) / window.innerWidth) * 100}%`, y: `${((r.top + r.height / 2) / window.innerHeight) * 100}%` });
    setPrev(curRef.current);
    curRef.current = to;
    setCur(to);
  }, []);

  // Vidéos : celle de l'écran affiché joue, l'ancienne s'arrête une fois couverte.
  useEffect(() => {
    play(bgRefs.current[cur], true);
    play(slideRefs.current[cur], true);
    if (prev === null) return;
    play(slideRefs.current[prev], false);
    const t = window.setTimeout(() => {
      play(bgRefs.current[prev], false);
      setPrev(null);
    }, REVEAL_MS + 50);
    return () => window.clearTimeout(t);
  }, [cur, prev]);

  // Changement d'orientation : relancer la vidéo affichée sur sa nouvelle source.
  useEffect(() => {
    play(bgRefs.current[curRef.current], true);
  }, [tall]);

  // Avance automatique.
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => go(curRef.current + 1), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [cur, paused, go]);

  // Molette, clavier, doigt ; relance des vidéos au premier geste si le
  // navigateur a bloqué la lecture automatique (économie d'énergie).
  useEffect(() => {
    let wheelAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 14 || Date.now() - wheelAt < 900) return;
      wheelAt = Date.now();
      go(curRef.current + (e.deltaY > 0 ? 1 : -1));
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(e.key)) go(curRef.current + 1);
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) go(curRef.current - 1);
    };
    let t0: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      t0 = (e.target as HTMLElement)?.closest("a, button, [data-compare]")
        ? null
        : { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!t0) return;
      const dx = t0.x - e.changedTouches[0].clientX;
      const dy = t0.y - e.changedTouches[0].clientY;
      t0 = null;
      const d = Math.abs(dy) > Math.abs(dx) ? dy : dx;
      if (Math.abs(d) > 40) go(curRef.current + (d > 0 ? 1 : -1));
    };
    const kick = () => {
      play(bgRefs.current[curRef.current], true);
      play(slideRefs.current[curRef.current], true);
    };
    const onVisible = () => !document.hidden && kick();
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("pointerdown", kick, { once: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("pointerdown", kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [go]);

  // Pause de l'avance au survol (souris seulement).
  const hold = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && setPaused(true),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === "mouse" && setPaused(false),
  };

  const labels = [c.home, c.examples, c.howItWorks, c.pricing];
  const slideClass = (i: number) => cx(s.slide, i === cur && s.on);

  return (
    <div className={cx(s.root, ready && s.ready, paused && s.paused)}>
      {BACKGROUNDS.map((bg, i) => (
        <div
          key={i}
          ref={(el) => {
            bgRefs.current[i] = el;
          }}
          className={cx(s.bg, i === cur && s.on, i === prev && s.under)}
          style={i === cur ? ({ "--cx": origin.x, "--cy": origin.y } as CSSProperties) : undefined}
          aria-hidden
        >
          <BackgroundVideo src={tall ? bg.v : bg.h} eager={i === 0} />
        </div>
      ))}

      <header className={s.header}>
        <button type="button" className={s.logo} onClick={(e) => go(0, e.currentTarget)}>
          TWINPOST
        </button>
        <nav className={s.nav} aria-label={c.home}>
          {labels.map((label, i) => (
            <button key={label} type="button" className={cx(i === cur && s.cur)} onClick={(e) => go(i, e.currentTarget)}>
              {label}
            </button>
          ))}
        </nav>
        <div className={s.topRight}>
          <span className={s.lang}>
            <LanguageSwitcher />
          </span>
          {!loggedIn && (
            <Link href="/login" className={s.signIn}>
              {c.signIn}
            </Link>
          )}
          <Link href={studioHref} className={s.pill}>
            {c.start}
          </Link>
        </div>
      </header>

      {/* 01 · Accueil */}
      <section
        ref={(el) => {
          slideRefs.current[0] = el;
        }}
        className={slideClass(0)}
        inert={cur !== 0}
        aria-label={c.home}
      >
        <Count i={0} />
        <div className={s.inner}>
          <div className={s.heroText}>
            <p className={cx(s.kicker, s.rise)}>{c.eyebrow}</p>
            <h1 className={s.title}>
              <Line i={0}>{c.titleTop}</Line>
              <Line i={1}>
                <em>{c.titleBottom}</em>
              </Line>
            </h1>
            <p className={cx(s.lead, s.rise)}>{c.heroText}</p>
            <div className={cx(s.actions, s.rise)} style={{ "--d": "0.1s" } as CSSProperties}>
              <Link href={studioHref} className={cx(s.pill, s.lg)} {...hold}>
                {c.ctaFirst}
                <Arrow />
              </Link>
              <button type="button" className={s.ghost} onClick={(e) => go(1, e.currentTarget)} {...hold}>
                {c.seeExamples}
              </button>
            </div>
          </div>
          <ul className={cx(s.perks, s.rise)} style={{ "--d": "0.2s" } as CSSProperties}>
            {c.perks.map((perk) => (
              <li key={perk} className={s.card} {...hold}>
                <Check />
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 02 · Exemples : avant / après */}
      <section
        ref={(el) => {
          slideRefs.current[1] = el;
        }}
        className={cx(slideClass(1), s.s1)}
        inert={cur !== 1}
        aria-label={c.examples}
      >
        <Count i={1} />
        <div className={s.inner}>
          <div className={s.wideText}>
            <p className={cx(s.kicker, s.rise)}>{c.examples}</p>
            <h2 className={cx(s.title, s.titleMd)}>
              <Line i={0}>{c.examplesTop}</Line>
              <Line i={1}>
                <em>{c.examplesBottom}</em>
              </Line>
            </h2>
            <p className={cx(s.lead, s.rise)}>{c.examplesText}</p>
          </div>
          <Compare before={c.compareBefore} after={c.compareAfter} hold={hold} />
        </div>
      </section>

      {/* 03 · Comment ça marche */}
      <section
        ref={(el) => {
          slideRefs.current[2] = el;
        }}
        className={cx(slideClass(2), s.s2)}
        inert={cur !== 2}
        aria-label={c.howItWorks}
      >
        <Count i={2} />
        <div className={s.inner}>
          <div className={s.stepsText}>
            <p className={cx(s.kicker, s.rise)}>{c.howItWorks}</p>
            <h2 className={s.title}>
              <Line i={0}>{c.featuresTop}</Line>
              <Line i={1}>
                <em>{c.featuresBottom}</em>
              </Line>
            </h2>
          </div>
        </div>
        <ol className={s.steps}>
          {c.steps.map((step, i) => (
            <li key={step.title} className={cx(s.card, s.rise)} style={{ "--d": `${i * 0.1}s` } as CSSProperties} {...hold}>
              <div className={s.th}>
                {i === 1 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/examples/micro-perso.jpg" alt="" />
                ) : (
                  <video
                    src={`/examples/${i === 0 ? "micro-avant" : "micro-apres"}.mp4`}
                    poster={`/examples/${i === 0 ? "micro-avant" : "micro-apres"}.jpg`}
                    muted
                    loop
                    playsInline
                    preload="none"
                  />
                )}
              </div>
              <div>
                <small>{String(i + 1).padStart(2, "0")}</small>
                <b>{step.title}</b>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 04 · Tarifs */}
      <section
        ref={(el) => {
          slideRefs.current[3] = el;
        }}
        className={cx(slideClass(3), s.s3)}
        inert={cur !== 3}
        aria-label={c.pricing}
      >
        <Count i={3} />
        <div className={s.inner}>
          <div className={s.priceText}>
            <p className={cx(s.kicker, s.rise)}>{c.pricing}</p>
            <h2 className={cx(s.title, s.titleSm)}>
              <Line i={0}>{c.finalTop}</Line>
              <Line i={1}>
                <em>{c.finalBottom}</em>
              </Line>
            </h2>
          </div>
        </div>
        <div className={s.packs}>
          <ul className={s.packRow}>
            {packs.map((pack, i) => (
              <li key={pack.id} className={s.rise} style={{ "--d": `${i * 0.08}s` } as CSSProperties}>
                <Link href={startHref} className={cx(s.card, s.pack, pack.featured && s.packFeatured)} {...hold}>
                  <span className={s.packTop}>
                    <span className={s.packCredits}>{pack.credits}</span>
                    {pack.featured && <span className={s.badge}>{c.popular}</span>}
                  </span>
                  <span className={s.packMeta}>{pack.bonus ?? pack.perEuro}</span>
                  <span className={s.packPrice}>{pack.price}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className={cx(s.packFoot, s.rise)} style={{ "--d": "0.25s" } as CSSProperties}>
            <Link href={studioHref} className={cx(s.pill, s.lg)} {...hold}>
              {c.ctaFirst}
              <Arrow />
            </Link>
            <Link href={creditsHref} className={s.subs}>
              {c.subsBefore}
              <span className={s.off}>{c.subsOff}</span>
              {c.subsAfter}
            </Link>
          </div>
        </div>
        <p className={cx(s.legal, s.rise)}>
          <Link href="/conditions">{c.terms}</Link>
          <span>© {new Date().getFullYear()} TwinPost</span>
        </p>
      </section>

      <div className={s.rail}>
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={i === cur ? "step" : undefined}
            className={cx(s.seg, i === cur && s.cur, i < cur && s.done)}
            onClick={(e) => go(i, e.currentTarget)}
          >
            <span className={s.segLabel}>
              {String(i + 1).padStart(2, "0")} <i>{label}</i>
            </span>
            <span className={s.bar}>
              <i key={i === cur ? `on-${cur}` : "off"} />
            </span>
          </button>
        ))}
        <button ref={nextRef} type="button" className={s.next} aria-label={c.nextScreen} onClick={(e) => go(cur + 1, e.currentTarget)}>
          <Arrow />
        </button>
      </div>
    </div>
  );
}

function Count({ i }: { i: number }) {
  return (
    <p className={cx(s.count, s.rise)}>
      <b>{String(i + 1).padStart(2, "0")}</b>
      <i>/ 04</i>
    </p>
  );
}

function Line({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <span className={s.ln}>
      <span style={{ "--i": i } as CSSProperties}>{children}</span>
    </span>
  );
}

function BackgroundVideo({ src, eager }: { src: string; eager: boolean }) {
  return (
    <video
      key={src}
      src={`${src}.mp4`}
      poster={`${src}.jpg`}
      muted
      loop
      playsInline
      autoPlay={eager}
      preload={eager ? "auto" : "metadata"}
      disablePictureInPicture
      disableRemotePlayback
    />
  );
}

// Avant / après : la séparation suit le doigt ou la souris sur la carte, et
// balaie toute seule le reste du temps.
function Compare({
  before,
  after,
  hold,
}: {
  before: string;
  after: string;
  hold: { onPointerEnter: (e: React.PointerEvent) => void; onPointerLeave: (e: React.PointerEvent) => void };
}) {
  const box = useRef<HTMLDivElement>(null);
  const va = useRef<HTMLVideoElement>(null);
  const vb = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let target = 50;
    let p = 50;
    let manual = false;
    let t0 = performance.now();
    let raf = 0;
    const move = (e: PointerEvent) => {
      manual = true;
      const b = el.getBoundingClientRect();
      target = Math.min(100, Math.max(0, ((e.clientX - b.left) / b.width) * 100));
    };
    const leave = () => {
      manual = false;
      t0 = performance.now();
    };
    const loop = (now: number) => {
      if (!manual) target = 50 + Math.sin((now - t0) / 1300) * 34;
      p += (target - p) * 0.12;
      el.style.setProperty("--p", `${p}%`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointercancel", leave);
    // Les deux vidéos restent calées l'une sur l'autre.
    const sync = window.setInterval(() => {
      const a = va.current;
      const b = vb.current;
      if (a && b && !a.paused && Math.abs(a.currentTime - b.currentTime) > 0.08) b.currentTime = a.currentTime;
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(sync);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointercancel", leave);
    };
  }, []);

  return (
    <div ref={box} data-compare className={cx(s.compare, s.card, s.rise)} style={{ "--d": "0.15s" } as CSSProperties} {...hold}>
      <video ref={va} src="/examples/mma-avant.mp4" poster="/examples/mma-avant.jpg" muted loop playsInline preload="none" />
      <video
        ref={vb}
        className={s.after}
        src="/examples/mma-apres.mp4"
        poster="/examples/mma-apres.jpg"
        muted
        loop
        playsInline
        preload="none"
      />
      <span className={s.split} />
      <span className={s.knob}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
        </svg>
      </span>
      <span className={cx(s.tag, s.tagA)}>{before}</span>
      <span className={cx(s.tag, s.tagB)}>{after}</span>
    </div>
  );
}
