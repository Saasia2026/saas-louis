"use client";

import { ArrowDownRight, ArrowUp, ArrowUpRight, Globe, LoaderCircle, Music2, RotateCcw, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { clearChat } from "./actions";
import { Markdown } from "./markdown";

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
export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  videos?: ChatVideo[];
  hashtags?: ChatHashtag[];
  sources?: ChatSource[];
};

// Courbe d'intérêt du hashtag sur la période (valeurs 0 à 100).
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 40},${14 - (v / 100) * 12}`).join(" ");
  return (
    <svg viewBox="0 0 40 16" aria-hidden className="h-4 w-10 shrink-0 text-accent-light">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

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

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "status"; tool: string }
  | { type: "videos"; items: ChatVideo[] }
  | { type: "hashtags"; items: ChatHashtag[] }
  | { type: "sources"; items: ChatSource[] }
  | { type: "error" }
  | { type: "done" };

export function ViralChat({ initial }: { initial: ChatMessage[] }) {
  const { t, locale } = useI18n();
  const V = t.viral;
  const compact = new Intl.NumberFormat(INTL_LOCALES[locale], { notation: "compact", maximumFractionDigits: 1 });
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, startClear] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, status]);

  const statusLabel: Record<string, string> = {
    web_search: V.searching,
    web_fetch: V.reading,
    tiktok_trends: V.tiktok,
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
    setBusy(true);
    setMessages((list) => [...list, { role: "user", text: message }, { role: "assistant", text: "" }]);
    try {
      const response = await fetch("/api/viral/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
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
    }
  }

  return (
    <div className="panel flex min-h-[32rem] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4 text-accent-light" />
          {V.chatTitle}
        </p>
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
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
          >
            <RotateCcw />
            {V.newChat}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">{V.empty}</p>
            <div className="flex flex-wrap gap-2">
              {V.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                {m.text}
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-[92%] space-y-4">
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
                    <Music2 className="size-3.5" />
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
                          <span className="min-w-0 flex-1 truncate font-medium text-text">{h.hashtag}</span>
                          <Sparkline values={h.curve} />
                          <span className="w-12 shrink-0 text-right text-xs text-faint tabular-nums">
                            {compact.format(h.views)}
                          </span>
                          {h.direction === "up" ? (
                            <ArrowUpRight className="size-3.5 shrink-0 text-success" />
                          ) : h.direction === "down" ? (
                            <ArrowDownRight className="size-3.5 shrink-0 text-danger" />
                          ) : (
                            <span className="size-3.5 shrink-0" />
                          )}
                        </a>
                      </li>
                    ))}
                  </ol>
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
                          {v.channel} · {fmt(V.views, { n: v.views.toLocaleString() })}
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
          ),
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={V.placeholder}
          className="field max-h-40 min-h-11 flex-1 resize-none"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn btn-accent size-11 p-0" aria-label={V.send}>
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
        </button>
      </form>
    </div>
  );
}
