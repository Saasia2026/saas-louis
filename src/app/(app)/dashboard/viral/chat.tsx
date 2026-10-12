"use client";

import {
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  ChartNoAxesColumn,
  Clapperboard,
  Flame,
  Globe,
  LoaderCircle,
  Music2,
  Play,
  RotateCcw,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { VIRAL_QUESTION_CREDITS } from "@/lib/credit-packs";
import { coverSrc } from "@/lib/trend-cover";
import { clearChat } from "./actions";
import { ASK_EVENT } from "./ask-button";
import { HashtagLabel } from "./hashtag-label";
import { Markdown } from "./markdown";
import { Sparkline } from "./sparkline";

export type ChatVideo = {
  id: string;
  title: string;
  channel: string;
  views: number;
  thumbnail: string;
  url: string;
};
export type ChatSource = { url: string; title: string };
export type ChatHashtag = {
  rank: number;
  hashtag: string;
  views: number;
  direction: string | null;
  url: string;
  curve: number[];
};
export type ChatTikTokVideo = {
  id: string;
  hashtag: string;
  url: string;
  cover: string;
  views: number;
  sound: string | null;
};
export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  videos?: ChatVideo[];
  hashtags?: ChatHashtag[];
  tiktokVideos?: ChatTikTokVideo[];
  sources?: ChatSource[];
};

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "status"; tool: string }
  | { type: "videos"; items: ChatVideo[] }
  | { type: "hashtags"; items: ChatHashtag[] }
  | { type: "tiktokVideos"; items: ChatTikTokVideo[] }
  | { type: "sources"; items: ChatSource[] }
  | { type: "error" }
  | { type: "done" };

// Une icône et une couleur par suggestion de départ, dans l'ordre du dictionnaire.
const SUGGESTIONS: { icon: LucideIcon; tile: string; card: string }[] = [
  { icon: Clapperboard, tile: "bg-violet-500/15 text-violet-400", card: "hover:border-violet-400/40" },
  { icon: Flame, tile: "bg-orange-500/15 text-orange-400", card: "hover:border-orange-400/40" },
  { icon: Play, tile: "bg-pink-500/15 text-pink-400", card: "hover:border-pink-400/40" },
  { icon: ChartNoAxesColumn, tile: "bg-sky-500/15 text-sky-400", card: "hover:border-sky-400/40" },
];

// Un même hashtag peut revenir de deux recherches (7 jours, nouveautés).
function uniqueHashtags(list: ChatHashtag[]) {
  return list.filter((h, i) => list.findIndex((o) => o.hashtag === h.hashtag) === i);
}

// Nom de domaine d'une source ; une adresse illisible reste affichée telle quelle.
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Marque de l'analyste, comme la tuile active de la navigation.
function AnalystMark() {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-accent-2 to-accent text-white"
      style={{ boxShadow: "0 2px 0 color-mix(in oklab, var(--accent) 62%, black)" }}
    >
      <TrendingUp className="size-3.5" />
    </span>
  );
}

export function ViralChat({ initial }: { initial: ChatMessage[] }) {
  const { t, locale } = useI18n();
  const V = t.viral;
  const compact = new Intl.NumberFormat(INTL_LOCALES[locale], { notation: "compact", maximumFractionDigits: 1 });
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Solde trop bas pour une question : l'erreur propose de recharger.
  const [noCredits, setNoCredits] = useState(false);
  const router = useRouter();
  const [clearing, startClear] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const statusLabel: Record<string, string> = {
    web_search: V.searching,
    web_fetch: V.reading,
    tiktok_trends: V.tiktok,
    tiktok_trend_videos: V.tiktokVideos,
    youtube_trending: V.trending,
    my_accounts: V.accounts,
    my_videos: V.videos,
  };

  const updateLast = (change: (m: ChatMessage) => ChatMessage) =>
    setMessages((list) => [...list.slice(0, -1), change(list[list.length - 1])]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setNoCredits(false);
    setBusy(true);
    setMessages((list) => [...list, { role: "user", text: message }, { role: "assistant", text: "" }]);
    try {
      const response = await fetch("/api/viral/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (response.status === 402) {
        setNoCredits(true);
        throw new Error(fmt(V.noCredits, { n: VIRAL_QUESTION_CREDITS }));
      }
      if (!response.ok || !response.body) throw new Error(response.status === 429 ? V.limit : V.error);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "text") {
            setStatus(null);
            updateLast((m) => ({ ...m, text: m.text + event.text }));
          } else if (event.type === "status") {
            setStatus(statusLabel[event.tool] ?? V.thinking);
          } else if (event.type === "videos") {
            updateLast((m) => ({ ...m, videos: [...(m.videos ?? []), ...event.items] }));
          } else if (event.type === "hashtags") {
            updateLast((m) => ({ ...m, hashtags: [...(m.hashtags ?? []), ...event.items] }));
          } else if (event.type === "tiktokVideos") {
            updateLast((m) => ({ ...m, tiktokVideos: [...(m.tiktokVideos ?? []), ...event.items] }));
          } else if (event.type === "sources") {
            updateLast((m) => ({ ...m, sources: event.items }));
          } else if (event.type === "error") {
            throw new Error(V.error);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : V.error);
      // Réponse vide : la bulle d'attente disparaît.
      setMessages((list) => (list[list.length - 1]?.text ? list : list.slice(0, -1)));
    } finally {
      setBusy(false);
      setStatus(null);
      // Solde de la barre du haut.
      router.refresh();
    }
  }
  sendRef.current = send;

  // Questions posées depuis la colonne des tendances.
  useEffect(() => {
    const ask = (e: Event) => sendRef.current((e as CustomEvent<string>).detail);
    window.addEventListener(ASK_EVENT, ask);
    return () => window.removeEventListener(ASK_EVENT, ask);
  }, []);

  const rows = Math.min(6, Math.max(1, input.split("\n").length));

  return (
    <div className="panel relative flex h-[calc(100dvh-15rem)] min-h-[34rem] animate-fade-up flex-col overflow-hidden">
      {messages.length > 0 && (
        <button
          type="button"
          disabled={busy || clearing}
          onClick={() =>
            startClear(async () => {
              await clearChat();
              setMessages([]);
            })
          }
          className="btn btn-ghost absolute top-3 right-3 z-10 px-2.5 py-1.5 text-xs"
        >
          <RotateCcw />
          {V.newChat}
        </button>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 sm:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col justify-center py-10">
            <span
              aria-hidden
              className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-hot text-white"
              style={{ boxShadow: "0 3px 0 color-mix(in oklab, var(--accent) 62%, black)" }}
            >
              <TrendingUp className="size-5" />
            </span>
            <h2 className="mt-5 font-headline text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.9]">
              {V.emptyTitle} <span className="text-shine">{V.emptyTitleShine}</span>
            </h2>
            <p className="mt-3 text-sm text-muted">{V.empty}</p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {V.suggestions.map((s, i) => {
                const { icon: Icon, tile, card } = SUGGESTIONS[i] ?? SUGGESTIONS[0];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className={`group flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3 text-left text-sm font-medium transition-[border-color,background-color,translate] duration-200 hover:-translate-y-0.5 hover:bg-surface-2 ${card}`}
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tile}`}>
                      <Icon className="size-4" />
                    </span>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-7 pt-14 pb-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <AnalystMark />
                  <div className="min-w-0 flex-1 space-y-4 pt-0.5">
                    {m.text ? (
                      <Markdown text={m.text} />
                    ) : (
                      busy &&
                      i === messages.length - 1 && (
                        <p className="flex items-center gap-2 text-sm text-muted">
                          <LoaderCircle className="size-4 animate-spin" />
                          {status ?? V.thinking}
                        </p>
                      )
                    )}
                    {busy && i === messages.length - 1 && m.text && status && (
                      <p className="flex items-center gap-2 text-xs text-faint">
                        <LoaderCircle className="size-3.5 animate-spin" />
                        {status}
                      </p>
                    )}
                    {m.hashtags && m.hashtags.length > 0 && (
                      <div className="rounded-xl border border-line bg-surface-2/40 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                          <Music2 className="size-3.5 text-accent-hot" />
                          {V.tiktokTitle}
                        </p>
                        <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                          {uniqueHashtags(m.hashtags).map((h) => (
                            <li key={h.hashtag}>
                              <a
                                href={h.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-md py-0.5 text-sm hover:text-text"
                              >
                                <span className="w-5 shrink-0 text-right text-xs text-faint tabular-nums">{h.rank}</span>
                                <span className="min-w-0 flex-1 truncate font-medium text-text">
                                  <HashtagLabel tag={h.hashtag} />
                                </span>
                                <Sparkline values={h.curve} />
                                <span className="w-12 shrink-0 text-right text-xs text-faint tabular-nums">
                                  {compact.format(h.views)}
                                </span>
                                {h.direction === "down" ? (
                                  <ArrowDownRight className="size-3.5 shrink-0 text-danger" />
                                ) : (
                                  <ArrowUpRight className="size-3.5 shrink-0 text-success" />
                                )}
                              </a>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {m.tiktokVideos && m.tiktokVideos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                        {m.tiktokVideos.map((v) => (
                          <a
                            key={v.id}
                            href={v.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
                          >
                            {/* Couverture TikTok, servie par notre relais (voir api/trends/cover). */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coverSrc(v.cover)}
                              alt=""
                              loading="lazy"
                              className="aspect-[9/16] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <span className="absolute top-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums">
                              {fmt(V.views, { n: compact.format(v.views) })}
                            </span>
                            <span className="absolute inset-x-1.5 bottom-1.5 space-y-0.5">
                              <span className="block truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white">
                                {v.hashtag}
                              </span>
                              {v.sound && (
                                <span className="flex items-center gap-1 truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[0.625rem] text-white/80">
                                  <Music2 className="size-3 shrink-0" />
                                  {v.sound}
                                </span>
                              )}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                    {m.videos && m.videos.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {m.videos.map((v) => (
                          <a
                            key={v.id}
                            href={v.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group overflow-hidden rounded-xl border border-line bg-surface-2/60 transition-colors hover:border-line-strong"
                          >
                            {/* Miniature hébergée par YouTube : pas d'optimisation Next. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={v.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                            <span className="block p-2.5">
                              <span className="line-clamp-2 text-xs font-semibold text-text">{v.title}</span>
                              <span className="mt-1 block truncate text-[0.6875rem] text-faint">
                                {v.channel} · {fmt(V.views, { n: compact.format(v.views) })}
                              </span>
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
                        <Globe className="size-3.5" />
                        {m.sources.map((s) => (
                          <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="max-w-56 truncate rounded-md border border-line px-2 py-0.5 hover:text-text"
                            title={s.title}
                          >
                            {hostOf(s.url)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {error && (
              <p className="text-sm text-danger">
                {error}
                {noCredits && (
                  <>
                    {" "}
                    <Link href="/dashboard/credits" className="font-semibold underline underline-offset-2">
                      {t.shell.recharge}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line bg-surface/80 px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-surface-2 p-1.5 pl-4 transition-colors focus-within:border-accent/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={rows}
            maxLength={2000}
            placeholder={V.placeholder}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={V.send}
            className="btn btn-accent size-10 shrink-0 rounded-xl p-0"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl px-4 text-xs text-faint">
          {fmt(V.cost, { n: VIRAL_QUESTION_CREDITS })}
        </p>
      </form>
    </div>
  );
}
