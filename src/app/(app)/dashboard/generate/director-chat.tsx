"use client";

import { useEffect, useRef, useState } from "react";
import type { DirectorDraft, DirectorMessage } from "@/lib/director";
import {
  FORMATS,
  keptSeconds,
  PACES,
  costOf,
  findPreset,
  formatDuration,
} from "@/lib/generation";
import { findTemplate } from "@/lib/templates";
import { directorChat } from "./actions";

const MAX_MESSAGE_LENGTH = 2000;

const IDEAS = [
  "Une pub UGC pour ma gourde isotherme",
  "Mon week-end à Lisbonne",
  "Teaser de lancement de mon podcast",
];

// Chat du mode Director : Claude construit la vidéo avec le créateur et tient
// à jour un brouillon, lancé ensuite comme une vidéo classique.
export function DirectorChat({
  twinId,
  credits,
  busy,
  onLaunch,
}: {
  twinId?: string;
  credits: number;
  busy: boolean;
  onLaunch: (draft: DirectorDraft, draftToken: string) => void;
}) {
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [draft, setDraft] = useState<{ value: DirectorDraft; token: string } | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send(content: string) {
    const message = content.trim();
    if (!message || pending) return;
    const next: DirectorMessage[] = [...messages, { role: "user", content: message }];
    setMessages(next);
    setText("");
    setError(null);
    setPending(true);

    const res = await directorChat({ messages: next, draftToken: draft?.token ?? null, twinId });
    setPending(false);
    if (res.error !== undefined) {
      // Le message non traité revient dans le champ pour être renvoyé.
      setMessages(messages);
      setText(message);
      setError(res.error);
      return;
    }
    setMessages([...next, { role: "assistant", content: res.data.reply }]);
    if (res.data.draft && res.data.draftToken) {
      setDraft({ value: res.data.draft, token: res.data.draftToken });
    }
  }

  const durationSeconds = draft
    ? draft.value.shots.length * keptSeconds(draft.value.preset, draft.value.pace)
    : 0;
  const cost = draft ? costOf("video", durationSeconds, draft.value.preset, draft.value.pace) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-[26rem] flex-col rounded-2xl border border-white/10 bg-card">
        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Bubble role="assistant">
            Salut, je suis ton Director. Raconte-moi ta vidéo : le sujet, le lieu, l&apos;ambiance.
            Je te propose un storyboard, puis on l&apos;ajuste ensemble.
          </Bubble>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}
          {pending && (
            <Bubble role="assistant">
              <span className="inline-flex gap-1" aria-label="Le Director écrit">
                <span className="size-1.5 animate-pulse rounded-full bg-muted" />
                <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
              </span>
            </Bubble>
          )}
          {!messages.length && (
            <div className="mt-auto flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => send(idea)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-muted transition-colors hover:border-neon-cyan hover:text-text"
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-end gap-2 border-t border-white/10 p-3"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            placeholder={
              draft
                ? "Ex. : rends le plan 2 plus dynamique, passe en qualité cinéma…"
                : "Décris ta vidéo…"
            }
            aria-label="Message au Director"
            className="flex-1 resize-none rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-neon-purple"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="rounded-lg bg-neon-purple px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Envoyer
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-neon-pink">{error}</p>}

      {draft && (
        <DraftCard
          draft={draft.value}
          durationSeconds={durationSeconds}
          cost={cost}
          canLaunch={!busy && !pending && credits >= cost}
          credits={credits}
          onLaunch={() => onLaunch(draft.value, draft.token)}
        />
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: DirectorMessage["role"]; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
        role === "user"
          ? "self-end rounded-br-sm bg-neon-purple/20"
          : "self-start rounded-bl-sm bg-white/5"
      }`}
    >
      {children}
    </div>
  );
}

function DraftCard({
  draft,
  durationSeconds,
  cost,
  canLaunch,
  credits,
  onLaunch,
}: {
  draft: DirectorDraft;
  durationSeconds: number;
  cost: number;
  canLaunch: boolean;
  credits: number;
  onLaunch: () => void;
}) {
  const chips = [
    FORMATS.find((f) => f.value === draft.aspectRatio)?.label,
    formatDuration(durationSeconds),
    `${draft.shots.length} plans`,
    PACES.find((p) => p.id === draft.pace)?.label,
    findPreset(draft.preset)?.label,
    findTemplate(draft.templateId)?.label,
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-white/10 p-4">
      <h2 className="font-display text-lg">{draft.title}</h2>
      <p className="mt-1 text-sm text-muted">{draft.brief}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span key={chip} className="rounded-full bg-white/5 px-2.5 py-1 text-xs">
            {chip}
          </span>
        ))}
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {draft.shots.map((shot, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="w-14 shrink-0 text-muted">Plan {i + 1}</span>
            <span>{shot.summary}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onLaunch}
        disabled={!canLaunch}
        className="mt-4 w-full rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Générer les images · {cost} crédit{cost > 1 ? "s" : ""}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        {credits >= cost
          ? "Tu valideras chaque image avant l'animation."
          : `Pas assez de crédits (${credits} restant${credits > 1 ? "s" : ""}).`}
      </p>
    </section>
  );
}
