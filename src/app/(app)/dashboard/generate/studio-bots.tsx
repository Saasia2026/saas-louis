"use client";

import { Check, Copy, ExternalLink, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { TrendPick } from "@/lib/trends";
import { askBot, type BotId, type BotTurn } from "./bot-actions";

// Deux conseillers flottants en bas à droite du studio : Scout (les vidéos
// d'influenceurs IA qui cartonnent aujourd'hui) et Hook (les accroches).
// Chacun a sa fenêtre : la sélection du jour, et une discussion.

const BOTS: BotId[] = ["scout", "hook"];
const TEASER_DELAY_MS = 2500;

function BotFace({ bot, className = "size-8" }: { bot: BotId; className?: string }) {
  const color = bot === "scout" ? "var(--accent)" : "var(--accent-hot)";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <line x1="16" y1="4" x2="16" y2="9" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="3.5" r="2.2" fill={color} />
      <rect x="4.5" y="8.5" width="23" height="19" rx="8.5" fill={color} />
      <rect x="8" y="12.5" width="16" height="10" rx="5" fill="#0b0a0e" />
      {bot === "scout" ? (
        <>
          <circle cx="13" cy="17.5" r="2" fill="#fff" />
          <circle cx="19" cy="17.5" r="2" fill="#fff" />
        </>
      ) : (
        <>
          <circle cx="13" cy="17.5" r="2" fill="#fff" />
          <path d="M17.2 17.6h3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }, () => {});
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
            {m.role === "assistant" && <BotFace bot={bot} className="mt-0.5 size-6 shrink-0" />}
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
            <BotFace bot={bot} className="size-6 shrink-0" />
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

export function StudioBots({ picks, day }: { picks: TrendPick[]; day: string }) {
  const { t, locale } = useI18n();
  const B = t.bots;
  const [open, setOpen] = useState<BotId | null>(null);
  const [tab, setTab] = useState<"list" | "chat">("list");
  const [teaser, setTeaser] = useState(false);
  const [chats, setChats] = useState<Record<BotId, BotTurn[]>>({ scout: [], hook: [] });
  const seenKey = `twinpost-bots-seen-${day}`;

  // Une seule invitation par jour, s'il y a une sélection.
  useEffect(() => {
    if (!picks.length) return;
    let seen = false;
    try {
      seen = localStorage.getItem(seenKey) === "1";
    } catch {}
    if (seen) return;
    const timer = setTimeout(() => setTeaser(true), TEASER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [picks.length, seenKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const markSeen = () => {
    setTeaser(false);
    try {
      localStorage.setItem(seenKey, "1");
    } catch {}
  };
  const toggle = (bot: BotId) => {
    markSeen();
    setTab(picks.length ? "list" : "chat");
    setOpen((o) => (o === bot ? null : bot));
  };
  const views = (n: number) =>
    fmt(B.views, { n: new Intl.NumberFormat(INTL_LOCALES[locale], { notation: "compact", maximumFractionDigits: 1 }).format(n) });

  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3 md:right-6 md:bottom-6">
      {open && (
        <section
          role="dialog"
          aria-label={B[open].name}
          className="pointer-events-auto flex h-[min(34rem,calc(100dvh-10rem))] w-[min(23rem,calc(100vw-2rem))] animate-fade-up flex-col overflow-hidden rounded-3xl border border-line-strong bg-surface shadow-[0_24px_60px_-12px_rgb(0_0_0/0.55)]"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <BotFace bot={open} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{B[open].name}</p>
              <p className="text-xs text-muted">{B[open].role}</p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="btn btn-ghost size-8 p-0" title={B.close}>
              <X className="size-4" />
              <span className="sr-only">{B.close}</span>
            </button>
          </header>
          <div className="flex gap-1 border-b border-line px-3 py-2">
            {(["list", "chat"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === k ? "bg-surface-3 text-text" : "text-muted hover:text-text"
                }`}
              >
                {k === "list" ? B[open].tab : B.chatTab}
              </button>
            ))}
          </div>

          {tab === "chat" ? (
            <Chat bot={open} turns={chats[open]} setTurns={(turns) => setChats((c) => ({ ...c, [open]: turns }))} />
          ) : !picks.length ? (
            <p className="p-4 text-sm text-muted">{B.empty}</p>
          ) : open === "scout" ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <p className="text-sm text-muted">{B.scoutIntro}</p>
              {picks.map((p) => (
                <article key={p.id} className="rounded-2xl border border-line bg-surface-2 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">@{p.author}</p>
                    <p className="shrink-0 text-xs text-muted tabular-nums">{views(p.views)}</p>
                  </div>
                  {p.caption && <p className="mt-1 line-clamp-2 text-xs text-muted italic">{p.caption}</p>}
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">{B.redo} : </span>
                    {p.how}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-light hover:underline"
                  >
                    {B.watch}
                    <ExternalLink className="size-3" />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              <p className="text-sm text-muted">{B.hookIntro}</p>
              {picks
                .filter((p) => p.hook)
                .map((p) => (
                  <div key={p.id} className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">« {p.hook} »</p>
                      <p className="mt-1 text-xs text-faint">{fmt(B.inspiredBy, { author: p.author })}</p>
                    </div>
                    <CopyButton text={p.hook} />
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {teaser && !open && (
        <div className="pointer-events-auto flex max-w-[16rem] animate-fade-up items-start gap-2 rounded-2xl border border-line-strong bg-surface p-3 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.5)]">
          <p className="text-sm">
            {fmt(B.teaser, { n: picks.length })}{" "}
            <button type="button" onClick={() => toggle("scout")} className="font-semibold text-accent-light hover:underline">
              {B.teaserOpen}
            </button>
          </p>
          <button type="button" onClick={markSeen} className="-m-1 shrink-0 p-1 text-faint hover:text-text" title={B.close}>
            <X className="size-3.5" />
            <span className="sr-only">{B.close}</span>
          </button>
        </div>
      )}

      <div className="pointer-events-auto flex gap-2">
        {BOTS.map((bot, i) => (
          <button
            key={bot}
            type="button"
            onClick={() => toggle(bot)}
            aria-expanded={open === bot}
            title={fmt(B.open, { name: B[bot].name })}
            className={`flex size-12 animate-bot-float items-center justify-center rounded-full border bg-surface shadow-[0_10px_24px_-8px_rgb(0_0_0/0.5)] transition-colors motion-reduce:animate-none ${
              open === bot ? "border-accent" : "border-line-strong hover:border-accent/60"
            }`}
            style={{ animationDelay: `${i * 0.6}s` }}
          >
            <BotFace bot={bot} />
            <span className="sr-only">{fmt(B.open, { name: B[bot].name })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
