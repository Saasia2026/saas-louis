"use client";

import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { TikTokAnalysis } from "@/lib/tiktok-analysis";
import type { TrendPick } from "@/lib/trends";
import { analyzeTikTok, applyRhythm, askBot, type BotId, type BotTurn } from "./actions";
import { BOTS_EVENT, botsEnabled, setBotsEnabled } from "./bots-state";
import { Ghost, Skull } from "./creatures";

// Les bots nagent sur tout l'écran comme des poissons dans un aquarium :
// Scout (le fantôme) montre les vidéos qui cartonnent, Hook (la tête de
// mort) propose quoi dire. Leurs petites bulles s'ouvrent au clic sur la
// fenêtre complète. Désactivables, choix gardé dans le navigateur.

const BOTS: BotId[] = ["scout", "hook"];
const SPEED = 36; // px/s, une nage calme
const FIRST_BUBBLES_MS = [9_000, 26_000];
const BUBBLE_EVERY_MS = 150_000;
const BUBBLE_VISIBLE_MS = 15_000;

type Sim = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  retargetAt: number;
  phase: number;
  face: number;
  faceTarget: number;
  lx: number;
  ly: number;
  blinkAt: number;
  blinkUntil: number;
  hover: boolean;
};

type Panel = { bot: BotId; tab: "video" | "account" | "hook" | "chat" };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const videoIdOf = (url: string) => /\/video\/(\d+)/.exec(url)?.[1] ?? null;

function useCompact(locale: keyof typeof INTL_LOCALES) {
  return (n: number) => new Intl.NumberFormat(INTL_LOCALES[locale], { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => {},
        );
      }}
      className="btn btn-ghost h-8 shrink-0 gap-1.5 px-2.5 text-xs"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? t.bots.copied : t.bots.copy}
    </button>
  );
}

function Chat({ bot, turns, setTurns }: { bot: BotId; turns: BotTurn[]; setTurns: (t: BotTurn[]) => void }) {
  const { t } = useI18n();
  const B = t.bots;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const Face = bot === "scout" ? Ghost : Skull;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next: BotTurn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setDraft("");
    setError(null);
    start(async () => {
      const reply = await askBot(bot, next);
      if (reply.ok) {
        setTurns([...next, { role: "assistant", text: reply.text }]);
        setLeft(reply.left);
      } else {
        setError(reply.error === "limit" ? B.errorLimit : B.errorFailed);
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <>
            <p className="text-sm text-muted">{bot === "scout" ? B.chatIntroScout : B.chatIntroHook}</p>
            <div className="flex flex-wrap gap-1.5">
              {(bot === "scout" ? B.startersScout : B.startersHook).map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="chip cursor-pointer hover:text-text">
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {turns.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex items-start gap-2"}>
            {m.role === "assistant" && <Face className="mt-0.5 size-7 shrink-0" />}
            <p
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                m.role === "user" ? "bg-accent text-white" : "bg-surface-2"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2">
            <Face className="size-7 shrink-0" />
            <span className="flex gap-1 rounded-2xl bg-surface-2 px-3 py-3" aria-hidden>
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            maxLength={800}
            placeholder={B.placeholder}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button type="submit" disabled={!draft.trim() || pending} className="btn btn-accent size-10 shrink-0 p-0" title={B.send}>
            <SendHorizontal className="size-4" />
            <span className="sr-only">{B.send}</span>
          </button>
        </div>
        {left !== null && <p className="mt-1.5 text-xs text-faint">{fmt(B.left, { n: left })}</p>}
      </form>
    </div>
  );
}

// Onglet « Mon compte » de Scout : analyse des 30 dernières vidéos TikTok.
function AccountPanel({ initial }: { initial: TikTokAnalysis | null }) {
  const { t, locale } = useI18n();
  const A = t.bots.account;
  const intl = INTL_LOCALES[locale];
  const num = useCompact(locale);
  const [analysis, setAnalysis] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<"ok" | "failed" | null>(null);
  const [pending, start] = useTransition();
  const [applying, startApply] = useTransition();
  const date = (iso: string, withTime = false) =>
    new Intl.DateTimeFormat(intl, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(iso));
  // 4 janvier 1970 = dimanche (0).
  const weekday = (d: number) => new Intl.DateTimeFormat(intl, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 4 + d)));

  const run = () => {
    setError(null);
    setApplied(null);
    start(async () => {
      const r = await analyzeTikTok(handle);
      if (r.ok) {
        setAnalysis(r.analysis);
        setEditing(false);
      } else {
        setError(
          r.error === "handle"
            ? A.errorHandle
            : r.error === "notFound"
              ? A.errorNotFound
              : r.error === "limit" && r.nextAt
                ? fmt(A.errorLimit, { date: date(r.nextAt, true) })
                : A.errorFailed,
        );
      }
    });
  };

  if (editing || !analysis) {
    return (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-sm text-muted">{A.intro}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="space-y-2"
        >
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={A.placeholder}
            disabled={pending}
            className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button type="submit" disabled={!handle.trim() || pending} className="btn btn-accent w-full">
            {pending ? A.analyzing : A.analyze}
          </button>
        </form>
        <p className="text-xs text-faint">{A.limitNote}</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const { stats, report } = analysis;
  const facts = [
    [num(stats.followers), A.followers],
    [num(stats.medianViews), A.medianViews],
    [`${stats.engagement} %`, A.engagement],
    [String(stats.postsPerWeek), A.perWeek],
  ];
  const section = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
        <ul className="mt-1.5 space-y-1.5 text-sm">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-semibold">@{analysis.handle}</p>
        <p className="shrink-0 text-xs text-faint">{fmt(A.analyzedOn, { date: date(analysis.createdAt) })}</p>
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface-2 py-2.5 text-center">
        {facts.map(([value, label]) => (
          <div key={label} className="px-1">
            <p className="text-sm font-semibold tabular-nums">{value}</p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
        <p className="font-headline text-3xl leading-none tabular-nums">{report.potential.score}</p>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{A.potential}</p>
          <p className="text-sm">{report.potential.note}</p>
        </div>
      </div>
      <p className="text-sm">{report.summary}</p>
      {section(A.keep, report.keep)}
      {section(A.stop, report.stop)}
      {section(A.next, report.nextVideos)}
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{A.rhythm}</p>
        <p className="mt-1 text-sm font-semibold">
          {report.rhythm.weekdays.map(weekday).join(", ")} · {report.rhythm.times.join(", ")}
        </p>
        <p className="mt-1 text-sm text-muted">{report.rhythm.reason}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={applying || applied === "ok"}
            onClick={() =>
              startApply(async () => {
                const r = await applyRhythm(analysis.id);
                setApplied(r.ok ? "ok" : "failed");
              })
            }
            className="btn btn-accent"
          >
            {applied === "ok" ? <Check className="size-4" /> : null}
            {A.apply}
          </button>
          {applied === "ok" && (
            <Link href="/dashboard/planning" className="text-sm font-medium text-accent-light hover:underline">
              {A.openPlanning}
            </Link>
          )}
        </div>
        {applied === "ok" && <p className="mt-2 text-xs text-success">{A.applied}</p>}
        {applied === "failed" && <p className="mt-2 text-xs text-danger">{A.applyFailed}</p>}
      </div>
      <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted hover:text-text hover:underline">
        {A.again}
      </button>
    </div>
  );
}

// Vidéo du jour lue directement dans la bulle (lecteur officiel de TikTok).
function VideoPanel({ picks, index, setIndex }: { picks: TrendPick[]; index: number; setIndex: (i: number) => void }) {
  const { t, locale } = useI18n();
  const B = t.bots;
  const num = useCompact(locale);
  const p = picks[index];
  const id = p ? videoIdOf(p.url) : null;
  if (!p) return <p className="p-4 text-sm text-muted">{B.empty}</p>;
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setIndex((index - 1 + picks.length) % picks.length)} className="btn btn-ghost size-8 p-0" title={B.prev}>
          <ChevronLeft className="size-4" />
          <span className="sr-only">{B.prev}</span>
        </button>
        <p className="text-xs text-muted tabular-nums">{fmt(B.videoOf, { i: index + 1, n: picks.length })}</p>
        <button type="button" onClick={() => setIndex((index + 1) % picks.length)} className="btn btn-ghost size-8 p-0" title={B.next}>
          <ChevronRight className="size-4" />
          <span className="sr-only">{B.next}</span>
        </button>
      </div>
      {id && (
        <div className="mx-auto aspect-[9/16] w-full max-w-[15.5rem] overflow-hidden rounded-2xl bg-black">
          <iframe
            key={id}
            src={`https://www.tiktok.com/player/v1/${id}?description=0&music_info=0&rel=0`}
            title={`@${p.author}`}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            className="size-full border-0"
          />
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-semibold">@{p.author}</p>
        <p className="shrink-0 text-xs text-muted tabular-nums">{fmt(B.views, { n: num(p.views) })}</p>
      </div>
      <p className="text-sm">
        <span className="font-semibold">{B.redo} : </span>
        {p.how}
      </p>
      <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent-light hover:underline">
        {B.watch}
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

// Proposition de Hook, en entier : l'accroche, pourquoi, comment, la vidéo.
function HookPanel({ picks, index, setIndex, showVideo }: { picks: TrendPick[]; index: number; setIndex: (i: number) => void; showVideo: () => void }) {
  const { t } = useI18n();
  const B = t.bots;
  const p = picks[index];
  if (!p) return <p className="p-4 text-sm text-muted">{B.empty}</p>;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{B.sayThis}</p>
        <div className="mt-1 flex items-start gap-2">
          <p className="min-w-0 flex-1 text-base font-semibold">« {p.hook} »</p>
          <CopyButton text={p.hook} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{B.why}</p>
        <p className="mt-1 text-sm">{p.why}</p>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{B.how}</p>
        <p className="mt-1 text-sm">{p.how}</p>
      </div>
      <button type="button" onClick={showVideo} className="btn btn-secondary w-full">
        {fmt(B.seeVideo, { author: p.author })}
      </button>
      {picks.length > 1 && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{B.otherHooks}</p>
          <div className="mt-1.5 space-y-1.5">
            {picks.map((o, i) =>
              i === index || !o.hook ? null : (
                <button key={o.id} type="button" onClick={() => setIndex(i)} className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-accent/60">
                  « {o.hook} »
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Aquarium({ picks, account }: { picks: TrendPick[]; account: TikTokAnalysis | null }) {
  const { t, locale } = useI18n();
  const B = t.bots;
  const num = useCompact(locale);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [bubble, setBubble] = useState<{ bot: BotId; pick: number } | null>(null);
  const [pick, setPick] = useState(0);
  const [chats, setChats] = useState<Record<BotId, BotTurn[]>>({ scout: [], hook: [] });

  const wrap: Record<BotId, RefObject<HTMLDivElement | null>> = { scout: useRef(null), hook: useRef(null) };
  const body: Record<BotId, RefObject<HTMLDivElement | null>> = { scout: useRef(null), hook: useRef(null) };
  const eyes: Record<BotId, RefObject<SVGGElement | null>> = { scout: useRef(null), hook: useRef(null) };
  const bubbleEl = useRef<HTMLDivElement>(null);
  const tailEl = useRef<HTMLSpanElement>(null);
  const sims = useRef<Record<BotId, Sim> | null>(null);
  // État courant lu par la boucle d'animation, sans la relancer.
  const live = useRef({ panel, bubble });
  useEffect(() => {
    live.current = { panel, bubble };
  }, [panel, bubble]);

  // Nage, respiration, regard et clignements, recalculés à chaque image.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => (window.innerWidth < 768 ? 52 : 64);
    const bounds = () => {
      const s = size();
      const w = window.innerWidth;
      const h = window.innerHeight;
      return { minX: 12, maxX: w - s - 12, minY: 84, maxY: h - s - (w < 768 ? 92 : 16), s, w, h };
    };
    const home = (bot: BotId) => {
      const b = bounds();
      return { x: b.w - (bot === "scout" ? 2 : 1) * (b.s + 12) - 4, y: b.maxY };
    };
    const now0 = performance.now();
    const fresh = (bot: BotId, i: number): Sim => {
      const b = bounds();
      const h = home(bot);
      return {
        x: reduced ? h.x : rand(b.minX, b.maxX),
        y: reduced ? h.y : rand(b.minY, b.maxY),
        vx: 0,
        vy: 0,
        tx: rand(b.minX, b.maxX),
        ty: rand(b.minY, b.maxY),
        retargetAt: now0 + rand(4000, 9000),
        phase: i * 2.1,
        face: 1,
        faceTarget: 1,
        lx: 0,
        ly: 0,
        blinkAt: now0 + rand(1500, 4000),
        blinkUntil: 0,
        hover: false,
      };
    };
    sims.current ??= { scout: fresh("scout", 0), hook: fresh("hook", 1) };
    const mouse = { x: -9999, y: -9999 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      const t = now / 1000;
      const b = bounds();
      const parked = Boolean(live.current.panel) || reduced;
      for (const bot of BOTS) {
        const m = sims.current![bot];
        let { tx, ty } = m;
        if (parked) {
          ({ x: tx, y: ty } = home(bot));
        } else if (now > m.retargetAt || Math.hypot(tx - m.x, ty - m.y) < 24) {
          m.tx = tx = rand(b.minX, b.maxX);
          m.ty = ty = rand(b.minY, b.maxY);
          m.retargetAt = now + rand(7000, 14000);
        }
        tx = clamp(tx, b.minX, b.maxX);
        ty = clamp(ty, b.minY, b.maxY);
        const dx = tx - m.x;
        const dy = ty - m.y;
        const d = Math.hypot(dx, dy) || 1;
        const talking = live.current.bubble?.bot === bot;
        const speed = parked ? 260 : talking ? SPEED * 0.3 : SPEED;
        const arrive = Math.min(1, d / 120);
        const want = m.hover ? [0, 0] : [(dx / d) * speed * arrive, (dy / d) * speed * arrive];
        const k = Math.min(1, dt * (parked ? 5 : 1.1));
        m.vx += (want[0] - m.vx) * k;
        m.vy += (want[1] - m.vy) * k;
        m.x = clamp(m.x + m.vx * dt, b.minX, b.maxX);
        m.y = clamp(m.y + m.vy * dt, b.minY, b.maxY);

        if (Math.abs(m.vx) > 5) m.faceTarget = Math.sign(m.vx);
        m.face += (m.faceTarget - m.face) * Math.min(1, dt * 4);
        const flip = Math.abs(m.face) < 0.2 ? 0.2 * Math.sign(m.face || 1) : m.face;
        const bob = reduced ? 0 : Math.sin(t * 1.7 + m.phase) * (parked ? 2 : 6);
        const breath = reduced ? 1 : 1 + 0.03 * Math.sin(t * 2.6 + m.phase);
        const tilt = clamp(m.vx * 0.25, -10, 10);

        const cx = m.x + b.s / 2;
        const cy = m.y + bob + b.s / 2;
        const md = Math.hypot(mouse.x - cx, mouse.y - cy);
        let lx: number;
        let ly: number;
        if (md < 280) {
          lx = ((mouse.x - cx) / md) * 3.4;
          ly = ((mouse.y - cy) / md) * 3;
        } else {
          lx = (m.vx / SPEED) * 2.4;
          ly = (m.vy / SPEED) * 1.8;
        }
        lx *= Math.sign(flip);
        m.lx += (lx - m.lx) * Math.min(1, dt * 6);
        m.ly += (ly - m.ly) * Math.min(1, dt * 6);
        if (now > m.blinkAt) {
          m.blinkUntil = now + 130;
          m.blinkAt = now + rand(2200, 6400);
        }
        const open = now < m.blinkUntil ? 0.12 : 1;

        const w = wrap[bot].current;
        if (w) w.style.transform = `translate3d(${m.x.toFixed(1)}px, ${(m.y + bob).toFixed(1)}px, 0)`;
        const bd = body[bot].current;
        if (bd) bd.style.transform = `rotate(${tilt.toFixed(2)}deg) scale(${(flip * breath).toFixed(3)}, ${(1 / breath).toFixed(3)})`;
        const e = eyes[bot].current;
        if (e) e.style.transform = `translate(${m.lx.toFixed(2)}px, ${m.ly.toFixed(2)}px) scaleY(${open})`;

        // La petite bulle suit sa créature, au-dessus (ou dessous près du haut).
        const bubbleNow = live.current.bubble;
        const el = bubbleEl.current;
        if (bubbleNow?.bot === bot && el && !live.current.panel) {
          const bw = el.offsetWidth;
          const bh = el.offsetHeight;
          const left = clamp(cx - bw / 2, 12, b.w - bw - 12);
          let top = m.y + bob - bh - 14;
          const below = top < 76;
          if (below) top = m.y + bob + b.s + 14;
          el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
          el.dataset.side = below ? "below" : "above";
          if (tailEl.current) tailEl.current.style.left = `${clamp(cx - left, 18, bw - 18) - 7}px`;
        }
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
    // Les refs sont stables : la boucle tourne une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Petites bulles de temps en temps : une accroche de Hook, puis une vidéo
  // de Scout, en avançant dans la sélection du jour.
  useEffect(() => {
    if (!picks.length) return;
    let n = 0;
    const show = () => {
      if (document.hidden || live.current.panel) return;
      const bot: BotId = n % 2 === 0 ? "hook" : "scout";
      setBubble({ bot, pick: Math.floor(n / 2) % picks.length });
      n++;
    };
    const timers = FIRST_BUBBLES_MS.map((ms) => setTimeout(show, ms));
    const every = setInterval(show, BUBBLE_EVERY_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(every);
    };
  }, [picks.length]);

  useEffect(() => {
    if (!bubble) return;
    const timer = setTimeout(() => setBubble(null), BUBBLE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [bubble]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const open = (bot: BotId, at?: number) => {
    if (typeof at === "number") setPick(at);
    setBubble(null);
    setPanel((p) =>
      p?.bot === bot && typeof at !== "number"
        ? null
        : { bot, tab: !picks.length ? (bot === "scout" ? "account" : "chat") : bot === "scout" ? "video" : "hook" },
    );
  };

  const tabs: Panel["tab"][] = panel?.bot === "scout" ? ["video", "account", "chat"] : ["hook", "chat"];
  const tabLabel = (k: Panel["tab"]) =>
    k === "video" ? B.videoTab : k === "account" ? B.accountTab : k === "hook" ? B.hookTab : B.chatTab;
  const bubblePick = bubble ? picks[bubble.pick] : undefined;

  return (
    <>
      {BOTS.map((bot) => {
        const Face = bot === "scout" ? Ghost : Skull;
        return (
          <div
            key={bot}
            ref={wrap[bot]}
            className="pointer-events-none fixed top-0 left-0 z-40 will-change-transform"
            style={{ transform: "translate3d(-200px, -200px, 0)" }}
          >
            <button
              type="button"
              onClick={() => open(bot, bubble?.bot === bot ? bubble.pick : undefined)}
              onPointerEnter={() => sims.current && (sims.current[bot].hover = true)}
              onPointerLeave={() => sims.current && (sims.current[bot].hover = false)}
              title={fmt(B.open, { name: B[bot].name })}
              className="pointer-events-auto block size-[52px] cursor-pointer drop-shadow-[0_10px_14px_rgb(0_0_0/0.35)] transition-[filter] hover:drop-shadow-[0_12px_18px_rgb(0_0_0/0.45)] md:size-16"
            >
              <div ref={body[bot]} className="size-full will-change-transform">
                <Face eyesRef={eyes[bot]} className="size-full" />
              </div>
              <span className="sr-only">{fmt(B.open, { name: B[bot].name })}</span>
            </button>
          </div>
        );
      })}

      {bubble && bubblePick && !panel && (
        <div
          ref={bubbleEl}
          className="group pointer-events-auto fixed top-0 left-0 z-40 w-max max-w-[15rem] animate-fade-up rounded-2xl border-2 border-line-strong bg-surface shadow-[0_14px_34px_-12px_rgb(0_0_0/0.5)]"
          style={{ transform: "translate3d(-400px, -400px, 0)" }}
        >
          <button type="button" onClick={() => open(bubble.bot, bubble.pick)} className="block w-full px-3 py-2 pr-7 text-left">
            {bubble.bot === "scout" ? (
              <>
                <span className="block text-sm font-semibold">{fmt(B.watchThis, { views: num(bubblePick.views) })}</span>
                <span className="block truncate text-xs text-muted">@{bubblePick.author}</span>
              </>
            ) : (
              <>
                <span className="block text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">{B.sayThis}</span>
                <span className="line-clamp-2 block text-sm font-medium">« {bubblePick.hook} »</span>
              </>
            )}
          </button>
          <button type="button" onClick={() => setBubble(null)} className="absolute top-1.5 right-1.5 p-0.5 text-faint hover:text-text" title={B.dismiss}>
            <X className="size-3.5" />
            <span className="sr-only">{B.dismiss}</span>
          </button>
          <span
            ref={tailEl}
            aria-hidden
            className="absolute size-3.5 rotate-45 border-line-strong bg-surface group-data-[side=above]:-bottom-[9px] group-data-[side=above]:border-r-2 group-data-[side=above]:border-b-2 group-data-[side=below]:-top-[9px] group-data-[side=below]:border-t-2 group-data-[side=below]:border-l-2"
          />
        </div>
      )}

      {panel && (
        <section
          role="dialog"
          aria-label={B[panel.bot].name}
          className="fixed right-4 bottom-[calc(5.75rem+3.75rem+env(safe-area-inset-bottom))] z-40 flex h-[min(44rem,calc(100dvh-14rem))] w-[min(24rem,calc(100vw-2rem))] animate-fade-up flex-col rounded-3xl border-2 border-line-strong bg-surface shadow-[0_24px_60px_-12px_rgb(0_0_0/0.55)] md:right-6 md:bottom-[calc(1rem+4.75rem)] md:h-[min(44rem,calc(100dvh-11rem))]"
        >
          <span
            aria-hidden
            className="absolute -bottom-[10px] size-4 rotate-45 border-r-2 border-b-2 border-line-strong bg-surface"
            style={{ right: panel.bot === "scout" ? "5.4rem" : "1.6rem" }}
          />
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            {panel.bot === "scout" ? <Ghost className="size-9" /> : <Skull className="size-9" />}
            <div className="min-w-0 flex-1">
              <p className="leading-tight font-semibold">{B[panel.bot].name}</p>
              <p className="text-xs text-muted">{B[panel.bot].role}</p>
            </div>
            <button type="button" onClick={() => setPanel(null)} className="btn btn-ghost size-8 p-0" title={B.close}>
              <X className="size-4" />
              <span className="sr-only">{B.close}</span>
            </button>
          </header>
          <div className="flex gap-1 border-b border-line px-3 py-2">
            {tabs.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPanel({ ...panel, tab: k })}
                aria-pressed={panel.tab === k}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  panel.tab === k ? "bg-surface-3 text-text" : "text-muted hover:text-text"
                }`}
              >
                {tabLabel(k)}
              </button>
            ))}
          </div>

          {panel.tab === "video" ? (
            <VideoPanel picks={picks} index={pick} setIndex={setPick} />
          ) : panel.tab === "account" ? (
            <AccountPanel initial={account} />
          ) : panel.tab === "hook" ? (
            <HookPanel picks={picks} index={pick} setIndex={setPick} showVideo={() => setPanel({ bot: "scout", tab: "video" })} />
          ) : (
            <Chat bot={panel.bot} turns={chats[panel.bot]} setTurns={(turns) => setChats((c) => ({ ...c, [panel.bot]: turns }))} />
          )}

          <footer className="border-t border-line px-4 py-2 text-right">
            <button type="button" onClick={() => setBotsEnabled(false)} className="text-xs text-faint hover:text-text hover:underline">
              {B.disable}
            </button>
          </footer>
        </section>
      )}
    </>
  );
}

export function BotsAquarium({ picks, account }: { picks: TrendPick[]; account: TikTokAnalysis | null }) {
  // Rien au rendu serveur : le choix « désactivés » est dans le navigateur.
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOn(botsEnabled());
    sync();
    window.addEventListener(BOTS_EVENT, sync);
    return () => window.removeEventListener(BOTS_EVENT, sync);
  }, []);
  return on ? <Aquarium picks={picks} account={account} /> : null;
}
