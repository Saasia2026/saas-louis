"use client";

import { ArrowUp, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { TikTokAnalysis } from "@/lib/tiktok-analysis";
import type { TrendPick } from "@/lib/trends";
import { VIRALITY_CREDITS, VIRALITY_MAX_SECONDS, type ViralityReport } from "@/lib/virality";
import { uploadSwapFile } from "../dashboard/generate/swap-input";
import { analyzeTikTok, applyRhythm, askBot, type BotId, type BotTurn } from "./actions";
import { BOTS_ANALYZE_EVENT, BOTS_EVENT, botsEnabled, setBotsEnabled, takeAnalyzeRequest, type AnalyzeRequest } from "./bots-state";
import s from "./bots.module.css";
import { BOT_VIDEO, BotHead, HookFace, ScoutFace } from "./creatures";
import { analyzeVideo } from "./virality-actions";

// Les bots dépassent du bas de l'écran, juste leurs yeux qui suivent le
// pointeur : Scout (tête blanche) montre les vidéos qui cartonnent, Hook
// (tête sombre) propose quoi dire. Ils se hissent quand ils parlent. Leurs petites bulles s'ouvrent au clic sur la
// fenêtre complète. Désactivables, choix gardé dans le navigateur.

const BOTS: BotId[] = ["scout", "hook"];
const FIRST_BUBBLES_MS = [9_000, 26_000];
const BUBBLE_EVERY_MS = 150_000;
const BUBBLE_VISIBLE_MS = 15_000;

type Panel = { bot: BotId; tab: "video" | "account" | "hook" | "chat" };

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

// Un message de la discussion ; une vidéo envoyée garde son aperçu, et la
// réponse à une analyse garde le lien vers le rapport complet.
type ChatTurn = BotTurn & { video?: string };

// Rapport de viralité résumé en texte : affiché dans la bulle, et relu par
// le bot dans la suite de la discussion.
function reportText(r: ViralityReport, B: { score: string; fixes: string; caption: string }) {
  const fixes = r.fixes.slice(0, 3).map((f) => `- ${f.title} : ${f.detail}`);
  return [`${B.score} : ${r.score}/100. ${r.verdict}`, fixes.length ? `${B.fixes} :\n${fixes.join("\n")}` : "", r.caption ? `${B.caption} : ${r.caption}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function Chat({
  bot,
  userId,
  turns,
  setTurns,
  request,
}: {
  bot: BotId;
  userId: string;
  turns: ChatTurn[];
  setTurns: (t: ChatTurn[]) => void;
  request?: AnalyzeRequest | null;
}) {
  const { t } = useI18n();
  const B = t.bots;
  const V = t.viral;
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const Face = bot === "scout" ? ScoutFace : HookFace;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  const ask = (next: ChatTurn[]) =>
    askBot(
      bot,
      next.map(({ role, text }) => ({ role, text })),
    );

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next: ChatTurn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setDraft("");
    setError(null);
    start(async () => {
      const reply = await ask(next);
      if (reply.ok) {
        setTurns([...next, { role: "assistant", text: reply.text }]);
        setLeft(reply.left);
      } else {
        setError(reply.error === "limit" ? B.errorLimit : B.errorFailed);
      }
    });
  };

  // Vidéo envoyée : déposée comme sur la page Viralité, puis analysée
  // (VIRALITY_CREDITS crédits) ; la note et les corrections reviennent ici.
  const sendVideo = (file: File | undefined) => {
    if (!file || pending) return;
    setError(null);
    if (!file.type.startsWith("video/") && !/\.(mp4|m4v|mov|qt|webm)$/i.test(file.name)) {
      setError(V.errors.format);
      return;
    }
    const question = draft.trim() || B.attachAsk;
    const next: ChatTurn[] = [...turns, { role: "user", text: question, video: URL.createObjectURL(file) }];
    setTurns(next);
    setDraft("");
    start(async () => {
      const path = await uploadSwapFile(supabase, userId, file);
      if (!path) {
        setError(V.errors.upload);
        return;
      }
      const res = await analyzeVideo({ path });
      if (!res.ok) {
        setError(fmt(V.errors[res.error], { max: VIRALITY_MAX_SECONDS }));
        return;
      }
      setTurns([...next, { role: "assistant", text: reportText(res.analysis.report, B) }]);
      // Solde de la barre du haut.
      router.refresh();
    });
  };

  // « Analyser » d'un rendu (studio, Mes vidéos) : même analyse, sans dépôt.
  const handled = useRef(0);
  useEffect(() => {
    if (!request || request.nonce === handled.current) return;
    handled.current = request.nonce;
    const next: ChatTurn[] = [...turns, { role: "user", text: B.attachAsk, video: request.url }];
    setTurns(next);
    setError(null);
    start(async () => {
      const res = await analyzeVideo({ generationId: request.generationId });
      if (!res.ok) {
        setError(fmt(V.errors[res.error], { max: VIRALITY_MAX_SECONDS }));
        return;
      }
      setTurns([...next, { role: "assistant", text: reportText(res.analysis.report, B) }]);
      router.refresh();
    });
    // Une seule fois par demande (nonce) ; l'historique courant est lu au moment de la demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={s.thread}>
        {turns.length === 0 && (
          <>
            <p className={s.intro}>{bot === "scout" ? B.chatIntroScout : B.chatIntroHook}</p>
            <div className={s.starters}>
              {(bot === "scout" ? B.startersScout : B.startersHook).map((q) => (
                <button key={q} type="button" onClick={() => send(q)} className={s.starter}>
                  {q}
                  <ArrowUpRight />
                </button>
              ))}
            </div>
          </>
        )}
        {turns.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className={s.me}>
              {m.video && <video src={m.video} muted playsInline controls className={s.clip} />}
              <div className={s.msgMe}>{m.text}</div>
            </div>
          ) : (
            <div key={i} className={s.bot}>
              <Face still className="mt-0.5 size-7 shrink-0" />
              <div className={s.msgBot}>{m.text}</div>
            </div>
          ),
        )}
        {pending && (
          <div className={s.bot}>
            <Face still className="size-7 shrink-0" />
            <span className={`${s.msgBot} ${s.typing}`}>
              <span className={s.dots} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {turns.at(-1)?.video && <span className="text-xs">{B.analyzingVideo}</span>}
            </span>
          </div>
        )}
        {error && <p className={s.error}>{error}</p>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className={s.composer}
      >
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            sendVideo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className={s.bar}>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            className={s.icon}
            title={fmt(B.attach, { credits: VIRALITY_CREDITS })}
          >
            <Plus className="size-5" />
            <span className="sr-only">{fmt(B.attach, { credits: VIRALITY_CREDITS })}</span>
          </button>
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
          />
          <button type="submit" disabled={!draft.trim() || pending} className={s.send} title={B.send}>
            <ArrowUp className="size-4" />
            <span className="sr-only">{B.send}</span>
          </button>
        </div>
        <p className={s.hint}>
          {left !== null ? `${fmt(B.left, { n: left })} · ` : ""}
          {fmt(B.attachHint, { credits: VIRALITY_CREDITS })}
        </p>
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
        <p className="eyebrow">{title}</p>
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
          <p className="eyebrow">{A.potential}</p>
          <p className="text-sm">{report.potential.note}</p>
        </div>
      </div>
      <p className="text-sm">{report.summary}</p>
      {section(A.keep, report.keep)}
      {section(A.stop, report.stop)}
      {section(A.next, report.nextVideos)}
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <p className="eyebrow">{A.rhythm}</p>
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
        <p className="eyebrow">{B.sayThis}</p>
        <div className="mt-1 flex items-start gap-2">
          <p className="min-w-0 flex-1 text-base font-semibold">« {p.hook} »</p>
          <CopyButton text={p.hook} />
        </div>
      </div>
      <div>
        <p className="eyebrow">{B.why}</p>
        <p className="mt-1 text-sm">{p.why}</p>
      </div>
      <div>
        <p className="eyebrow">{B.how}</p>
        <p className="mt-1 text-sm">{p.how}</p>
      </div>
      <button type="button" onClick={showVideo} className="btn btn-secondary w-full">
        {fmt(B.seeVideo, { author: p.author })}
      </button>
      {picks.length > 1 && (
        <div>
          <p className="eyebrow">{B.otherHooks}</p>
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

function Aquarium({ userId, picks, account }: { userId: string; picks: TrendPick[]; account: TikTokAnalysis | null }) {
  const { t, locale } = useI18n();
  const B = t.bots;
  const num = useCompact(locale);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [bubble, setBubble] = useState<{ bot: BotId; pick: number } | null>(null);
  const [pick, setPick] = useState(0);
  const [chats, setChats] = useState<Record<BotId, ChatTurn[]>>({ scout: [], hook: [] });
  const [request, setRequest] = useState<AnalyzeRequest | null>(null);

  // « Analyser » d'un rendu : Hook ouvre sa discussion et lance l'analyse.
  useEffect(() => {
    const take = () => {
      const r = takeAnalyzeRequest();
      if (!r) return;
      setBubble(null);
      setPanel({ bot: "hook", tab: "chat" });
      setRequest(r);
    };
    take();
    window.addEventListener(BOTS_ANALYZE_EVENT, take);
    return () => window.removeEventListener(BOTS_ANALYZE_EVENT, take);
  }, []);

  const heads: Record<BotId, RefObject<HTMLButtonElement | null>> = { scout: useRef(null), hook: useRef(null) };
  const pupils: Record<BotId, RefObject<SVGGElement | null>> = { scout: useRef(null), hook: useRef(null) };
  const lids: Record<BotId, RefObject<SVGGElement | null>> = { scout: useRef(null), hook: useRef(null) };
  // Le bot qui se hisse un peu pour regarder (de temps en temps).
  const [peeking, setPeeking] = useState<BotId | null>(null);
  const live = useRef({ panel, bubble });
  useEffect(() => {
    live.current = { panel, bubble };
  }, [panel, bubble]);

  // Regard qui suit le pointeur, et clignements.
  useEffect(() => {
    const mouse = { x: -1, y: -1 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const look = { scout: { x: 0, y: 0 }, hook: { x: 0, y: 0 } };
    const blink = { scout: { at: performance.now() + rand(1500, 4000), until: 0 }, hook: { at: performance.now() + rand(2500, 5000), until: 0 } };
    let raf = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) return;
      for (const bot of BOTS) {
        const head = heads[bot].current;
        if (!head) continue;
        const r = head.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.36;
        let tx = 0;
        let ty = 0;
        if (mouse.x >= 0) {
          const dx = mouse.x - cx;
          const dy = mouse.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, d / 160);
          tx = (dx / d) * 6 * reach;
          ty = (dy / d) * 6 * reach;
        }
        const l = look[bot];
        l.x += (tx - l.x) * 0.15;
        l.y += (ty - l.y) * 0.15;
        const pu = pupils[bot].current;
        if (pu) pu.style.transform = `translate(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px)`;
        const bl = blink[bot];
        if (now > bl.at) {
          bl.until = now + 130;
          bl.at = now + rand(2400, 6400);
        }
        const li = lids[bot].current;
        if (li) li.style.transform = `scaleY(${now < bl.until ? 0.1 : 1})`;
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

  // De temps en temps, l'un des deux se hisse un peu et regarde la page.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        if (!document.hidden && !live.current.panel && !live.current.bubble) {
          setPeeking(Math.random() < 0.5 ? "scout" : "hook");
          setTimeout(() => setPeeking(null), 1800);
        }
        next();
      }, rand(7000, 14000));
    };
    next();
    return () => clearTimeout(timer);
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
      {/* Les deux têtes qui dépassent du bas de l'écran (au-dessus de la
          barre du bas sur téléphone), la bulle de parole au-dessus. */}
      <div className={s.peek}>
        {bubble && bubblePick && !panel && (
          <div className={`${s.say} ${s.peekSay} animate-fade-up`} data-bot={bubble.bot}>
            <button type="button" onClick={() => open(bubble.bot, bubble.pick)} className="block w-full px-3 py-2 pr-7 text-left">
              {bubble.bot === "scout" ? (
                <>
                  <span className="block text-sm font-semibold">{fmt(B.watchThis, { views: num(bubblePick.views) })}</span>
                  <span className="block truncate text-xs text-white/60">@{bubblePick.author}</span>
                </>
              ) : (
                <>
                  <span className="block text-xs text-white/60">{B.sayThis}</span>
                  <span className="line-clamp-2 block text-sm font-medium">« {bubblePick.hook} »</span>
                </>
              )}
            </button>
            <button type="button" onClick={() => setBubble(null)} className="absolute top-1.5 right-1.5 p-0.5 text-white/50 hover:text-white" title={B.dismiss}>
              <X className="size-3.5" />
              <span className="sr-only">{B.dismiss}</span>
            </button>
            <span aria-hidden className={s.sayTail} />
          </div>
        )}
        <div className={s.peekWindow}>
          {BOTS.map((bot) => (
            <button
              key={bot}
              ref={heads[bot]}
              type="button"
              onClick={() => open(bot, bubble?.bot === bot ? bubble.pick : undefined)}
              title={fmt(B.open, { name: B[bot].name })}
              data-up={bubble?.bot === bot || peeking === bot || panel?.bot === bot ? "" : undefined}
              className={s.peekHead}
            >
              <BotHead bot={bot} pupilsRef={pupils[bot]} lidsRef={lids[bot]} className="block size-full" />
              <span className="sr-only">{fmt(B.open, { name: B[bot].name })}</span>
            </button>
          ))}
        </div>
      </div>

      {panel && (
        <section role="dialog" aria-label={B[panel.bot].name} className={`video-page ${s.panel}`}>
          <header className={s.head}>
            <video key={panel.bot} src={`${BOT_VIDEO[panel.bot]}.mp4`} poster={`${BOT_VIDEO[panel.bot]}.jpg`} muted loop autoPlay playsInline aria-hidden />
            {panel.bot === "scout" ? <ScoutFace className="size-14 shrink-0" /> : <HookFace className="size-14 shrink-0" />}
            <div className="min-w-0 flex-1 pb-0.5">
              <p className={s.name}>{B[panel.bot].name}</p>
              <p className={s.role}>{B[panel.bot].role}</p>
            </div>
            <button type="button" onClick={() => setPanel(null)} className={s.close} title={B.close}>
              <X className="size-4" />
              <span className="sr-only">{B.close}</span>
            </button>
          </header>
          <div className={s.tabs}>
            {tabs.map((k) => (
              <button key={k} type="button" onClick={() => setPanel({ ...panel, tab: k })} aria-pressed={panel.tab === k}>
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
            <Chat
              bot={panel.bot}
              userId={userId}
              turns={chats[panel.bot]}
              setTurns={(turns) => setChats((c) => ({ ...c, [panel.bot]: turns }))}
              request={panel.bot === "hook" ? request : null}
            />
          )}

          <footer className={s.foot}>
            <button type="button" onClick={() => setBotsEnabled(false)}>
              {B.disable}
            </button>
          </footer>
        </section>
      )}
    </>
  );
}

export function BotsAquarium({ userId, picks, account }: { userId: string; picks: TrendPick[]; account: TikTokAnalysis | null }) {
  // Rien au rendu serveur : le choix « désactivés » est dans le navigateur.
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOn(botsEnabled());
    sync();
    window.addEventListener(BOTS_EVENT, sync);
    return () => window.removeEventListener(BOTS_EVENT, sync);
  }, []);
  return on ? <Aquarium userId={userId} picks={picks} account={account} /> : null;
}
