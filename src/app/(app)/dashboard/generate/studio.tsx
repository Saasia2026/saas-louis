"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  Plus,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DirectorDraft, DirectorMessage } from "@/lib/director";
import {
  DEFAULT_PACE,
  DEFAULT_PRESET,
  FORMATS,
  keptSeconds,
  MAX_PROMPT_LENGTH,
  PACES,
  PRESETS,
  costOf,
  findPreset,
  formatDuration,
  type AspectRatio,
  type GenerationKind,
  type Pace,
  type PresetId,
} from "@/lib/generation";
import { findTemplate, VIDEO_TEMPLATES, type VideoTemplate } from "@/lib/templates";
import {
  cancelVideo,
  directorChat,
  generate,
  getGeneration,
  launchDirectorVideo,
  type GenerationView,
} from "./actions";

const POLL_INTERVAL_MS: Record<GenerationKind, number> = { image: 3_000, video: 4_000 };
const MAX_MESSAGE_LENGTH = 2000;

const IDEAS = [
  "Une pub UGC pour ma gourde isotherme",
  "Mon week-end à Lisbonne en vlog",
  "Teaser de lancement de mon podcast",
  "Un lévrier champion d'haltérophilie, façon JO",
];

// Environ 10 min de marge, plus le temps de rendu des plans.
function pollTimeoutMs(job: Job) {
  return job.kind === "image" ? 5 * 60_000 : 10 * 60_000 + job.durationSeconds * 5_000;
}

export type Job = { kind: GenerationKind; aspectRatio: AspectRatio; durationSeconds: number };

type Phase =
  | { kind: "idle" }
  | { kind: "generating"; job: Job; id: string; view?: GenerationView }
  | { kind: "done"; job: Job; view: GenerationView }
  | { kind: "error"; message: string };

type Active = { id: string; job: Job };
type Mode = "director" | "direct";

// Studio : une seule zone de saisie. En mode Director, la discussion avec
// Claude construit un brouillon ; en mode Direct, la demande part telle
// quelle avec les réglages de la barre d'outils. Les réglages secondaires
// (style, rythme, personnage) restent repliés derrière le bouton +.
export function Studio({
  credits,
  maxVideoSeconds,
  presets,
  characters,
  resume,
}: {
  credits: number;
  maxVideoSeconds: number;
  // Préréglages disponibles (aucun sans FAL_KEY).
  presets: PresetId[];
  // Personnages prêts (Sora), réutilisables d'une vidéo à l'autre.
  characters: { id: string; name: string }[];
  // Vidéo encore en cours, reprise à l'ouverture de la page.
  resume?: Active;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("director");
  const [text, setText] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Réglages du mode Direct.
  const [template, setTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [preset, setPreset] = useState<PresetId>(
    presets.includes(DEFAULT_PRESET) ? DEFAULT_PRESET : (presets[0] ?? DEFAULT_PRESET),
  );
  const [pace, setPace] = useState<Pace>(DEFAULT_PACE);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [durationSeconds, setDurationSeconds] = useState(Math.min(15, maxVideoSeconds));
  const [characterId, setCharacterId] = useState<string | undefined>();

  // Discussion avec le Director.
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [draft, setDraft] = useState<{ value: DirectorDraft; token: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Génération en cours.
  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);

  const threadEnd = useRef<HTMLDivElement>(null);
  const busy = phase.kind === "generating";

  // La durée tombe toujours juste sur la longueur d'un plan.
  const step = keptSeconds(preset, pace);
  const duration = Math.max(step, Math.round(durationSeconds / step) * step);
  const directCost = costOf("video", duration, preset, pace);

  const started = messages.length > 0 || phase.kind !== "idle";

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, draft, phase.kind]);

  // Suivi de la génération active. Sans webhook joignable (dev local), c'est
  // aussi ce suivi qui la fait avancer.
  useEffect(() => {
    if (!active) return;
    const { id, job } = active;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + pollTimeoutMs(job);

    const finish = (next: Phase) => {
      setPhase(next);
      setActive(null);
      router.refresh(); // crédits à jour dans l'en-tête
    };

    async function tick() {
      const res = await getGeneration(id);
      if (stopped) return;
      if (res.error !== undefined) return finish({ kind: "error", message: res.error });

      const view = res.data;
      if (view.status === "completed" && view.mediaUrl) {
        return finish({ kind: "done", job, view });
      }
      if (view.status === "failed") {
        return finish({
          kind: "error",
          message:
            view.error ?? "La génération a échoué ou a été annulée. Tes crédits ont été rendus.",
        });
      }
      setPhase({ kind: "generating", job, id, view });
      if (Date.now() > deadline) {
        return finish({
          kind: "error",
          message: "C'est plus long que prévu. Recharge la page dans quelques minutes.",
        });
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS[job.kind]);
    }

    timer = setTimeout(tick, resume?.id === id ? 0 : POLL_INTERVAL_MS[job.kind]);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, resume, router]);

  function pickTemplate(next: VideoTemplate) {
    setTemplate(next);
    setAspectRatio(next.aspectRatio);
    setDurationSeconds(Math.min(next.durationSeconds, maxVideoSeconds));
  }

  async function launch(job: Job, request: () => ReturnType<typeof generate>) {
    setPhase({ kind: "generating", job, id: "" });
    const res = await request();
    router.refresh();
    if (res.error !== undefined) {
      setPhase({ kind: "error", message: res.error });
      return;
    }
    setActive({ id: res.data.generationId, job });
  }

  function launchDirect(prompt: string) {
    const job: Job = { kind: "video", aspectRatio, durationSeconds: duration };
    return launch(job, () =>
      generate({
        prompt,
        kind: "video",
        aspectRatio,
        durationSeconds: duration,
        templateId: template.id,
        preset,
        pace,
        characterId,
      }),
    );
  }

  function launchDraft(value: DirectorDraft, token: string) {
    const job: Job = {
      kind: "video",
      aspectRatio: value.aspectRatio,
      durationSeconds: value.shots.length * keptSeconds(value.preset, value.pace),
    };
    return launch(job, () => launchDirectorVideo({ characterId, draftToken: token }));
  }

  async function sendToDirector(content: string) {
    const next: DirectorMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setChatError(null);
    setPending(true);
    const res = await directorChat({ messages: next, draftToken: draft?.token ?? null });
    setPending(false);
    if (res.error !== undefined) {
      // Le message non traité revient dans le champ pour être renvoyé.
      setMessages(messages);
      setText(content);
      setChatError(res.error);
      return;
    }
    setMessages([...next, { role: "assistant", content: res.data.reply }]);
    if (res.data.draft && res.data.draftToken) {
      setDraft({ value: res.data.draft, token: res.data.draftToken });
    }
  }

  const canSend =
    text.trim().length > 0 &&
    (mode === "director" ? !pending : !busy && credits >= directCost);

  function submit() {
    const content = text.trim();
    if (!canSend) return;
    setText("");
    if (mode === "director") sendToDirector(content);
    else launchDirect(content);
  }

  const composer = (
    <Composer
      mode={mode}
      onMode={(m) => {
        setMode(m);
        setShowSettings(false);
      }}
      text={text}
      onText={setText}
      onSubmit={submit}
      canSend={canSend}
      placeholder={
        mode === "director"
          ? draft
            ? "Ex. : rends le plan 2 plus dynamique, passe en 16:9…"
            : "Raconte ta vidéo au Director : le sujet, le lieu, l'ambiance…"
          : template.placeholder
      }
      showSettings={showSettings}
      onToggleSettings={() => setShowSettings((v) => !v)}
      openUp={started}
      tools={
        mode === "direct" ? (
          <>
            <Menu
              label={findPreset(preset)?.label ?? "Qualité"}
              openUp={started}
              options={PRESETS.filter((p) => presets.includes(p.id)).map((p) => ({
                value: p.id,
                label: p.label,
                hint: p.hint,
              }))}
              value={preset}
              onChange={(v) => setPreset(v as PresetId)}
            />
            <Menu
              label={formatDuration(duration)}
              openUp={started}
              options={durationOptions(step, maxVideoSeconds).map((s) => ({
                value: String(s),
                label: formatDuration(s),
              }))}
              value={String(duration)}
              onChange={(v) => setDurationSeconds(Number(v))}
            />
            <Menu
              label={aspectRatio}
              openUp={started}
              options={FORMATS.map((f) => ({ value: f.value, label: f.label, hint: f.hint }))}
              value={aspectRatio}
              onChange={(v) => setAspectRatio(v as AspectRatio)}
            />
          </>
        ) : null
      }
      status={
        mode === "direct"
          ? credits >= directCost
            ? `${directCost} crédit${directCost > 1 ? "s" : ""}`
            : "Crédits insuffisants"
          : "Le Director règle durée, format et qualité avec toi"
      }
      settings={
        <div className="flex flex-col gap-4">
          {mode === "direct" && (
            <SettingGroup label="Style de vidéo">
              {VIDEO_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.hint}
                  aria-pressed={template.id === t.id}
                  onClick={() => pickTemplate(t)}
                  className="chip"
                >
                  {t.label}
                </button>
              ))}
            </SettingGroup>
          )}
          {mode === "direct" && (
            <SettingGroup label="Rythme">
              {PACES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.hint}
                  aria-pressed={pace === p.id}
                  onClick={() => setPace(p.id)}
                  className="chip"
                >
                  {p.label}
                </button>
              ))}
            </SettingGroup>
          )}
          <SettingGroup label="Personnage">
            <button
              type="button"
              aria-pressed={!characterId}
              onClick={() => setCharacterId(undefined)}
              className="chip"
            >
              Aucun
            </button>
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={characterId === c.id}
                onClick={() => setCharacterId(c.id)}
                className="chip"
              >
                {c.name}
              </button>
            ))}
            {!characters.length && (
              <span className="text-xs text-faint">Aucun personnage prêt pour l&apos;instant.</span>
            )}
          </SettingGroup>
        </div>
      }
    />
  );

  return (
    <div className="relative isolate -mt-10 flex min-h-[calc(100dvh-8.5rem)] flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="starfield absolute inset-0" />
        <div
          className="starfield absolute inset-0 opacity-60"
          style={{ backgroundSize: "420px 420px", animationDuration: "220s", backgroundPosition: "140px 90px" }}
        />
      </div>

      {!started ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12">
          <h1 className="flex animate-fade-up items-center gap-3 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
            <Sparkles className="size-9 shrink-0 text-accent-light drop-shadow-[0_0_14px_var(--accent)] sm:size-11" />
            <span className="text-gradient">Qu&apos;est-ce qu&apos;on tourne ?</span>
          </h1>
          <p className="mt-4 animate-fade-up text-center text-[0.9375rem] text-muted [animation-delay:80ms]">
            Décris ta vidéo : storyboard, plans et montage sont faits pour toi.
          </p>

          <div className="relative z-20 mt-10 w-full max-w-3xl animate-fade-up [animation-delay:160ms]">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-16 -inset-y-12 -z-10 animate-aurora rounded-full bg-[radial-gradient(closest-side,rgb(91_124_255/0.28),transparent)] blur-2xl"
            />
            {composer}
          </div>

          <div className="mt-6 flex max-w-3xl animate-fade-up flex-wrap justify-center gap-2 [animation-delay:240ms]">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" onClick={() => setText(idea)} className="chip">
                {idea}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 pt-4 pb-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="max-w-[85%] animate-fade-up self-end rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[0.9375rem] whitespace-pre-wrap"
                >
                  {m.content}
                </div>
              ) : (
                <AssistantMessage key={i}>{m.content}</AssistantMessage>
              ),
            )}
            {pending && (
              <AssistantMessage>
                <span className="inline-flex gap-1 py-1.5" aria-label="Le Director écrit">
                  <span className="size-1.5 animate-pulse rounded-full bg-muted" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
                </span>
              </AssistantMessage>
            )}
            {chatError && <p className="text-sm text-danger">{chatError}</p>}

            {draft && phase.kind === "idle" && (
              <DraftCard
                draft={draft.value}
                credits={credits}
                disabled={busy || pending}
                onLaunch={() => launchDraft(draft.value, draft.token)}
              />
            )}

            {phase.kind !== "idle" && (
              <Result
                phase={phase}
                onReset={() => setPhase({ kind: "idle" })}
                onCancel={async () => {
                  if (phase.kind !== "generating" || !phase.id) return;
                  await cancelVideo(phase.id);
                  setActive(null);
                  setPhase({ kind: "idle" });
                  router.refresh();
                }}
              />
            )}
            <div ref={threadEnd} />
          </div>

          <div className="sticky bottom-4 z-10 mx-auto w-full max-w-3xl">{composer}</div>
        </>
      )}
    </div>
  );
}

function durationOptions(step: number, max: number) {
  const options: number[] = [];
  for (let s = step; s <= max && options.length < 8; s += step) options.push(s);
  return options;
}

function Composer({
  mode,
  onMode,
  text,
  onText,
  onSubmit,
  canSend,
  placeholder,
  tools,
  status,
  showSettings,
  onToggleSettings,
  settings,
  openUp,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  text: string;
  onText: (text: string) => void;
  onSubmit: () => void;
  canSend: boolean;
  placeholder: string;
  tools: React.ReactNode;
  status: string;
  showSettings: boolean;
  onToggleSettings: () => void;
  settings: React.ReactNode;
  openUp: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="composer"
    >
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        maxLength={Math.max(MAX_PROMPT_LENGTH, MAX_MESSAGE_LENGTH)}
        rows={openUp ? 1 : 3}
        placeholder={placeholder}
        aria-label="Décris ta vidéo"
        className={`field-sizing-content block max-h-60 w-full ${openUp ? "min-h-12" : "min-h-24"} resize-none bg-transparent px-5 pt-4 pb-2 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint`}
      />

      {showSettings && (
        <div className="mx-4 mb-2 animate-fade-up rounded-xl border border-line bg-surface-2/70 p-4 [animation-duration:200ms]">
          {settings}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={onToggleSettings}
          aria-expanded={showSettings}
          title="Plus de réglages"
          className={`flex size-8 items-center justify-center rounded-full border transition-all ${
            showSettings
              ? "rotate-45 border-accent/60 bg-accent/15 text-accent-light"
              : "border-line bg-surface-3 text-muted hover:text-text"
          }`}
        >
          <Plus className="size-4" />
        </button>

        <div className="flex rounded-full border border-line bg-surface-2 p-0.5 text-sm">
          {(
            [
              { value: "director", label: "Director", hint: "Construis ta vidéo en discutant" },
              { value: "direct", label: "Direct", hint: "Lance ta demande telle quelle" },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              title={m.hint}
              aria-pressed={mode === m.value}
              onClick={() => onMode(m.value)}
              className={`rounded-full px-3 py-1 transition-colors ${
                mode === m.value ? "bg-surface-3 text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {tools}
          <span className="hidden px-2 text-xs text-faint sm:inline">{status}</span>
          <button
            type="submit"
            disabled={!canSend}
            title={mode === "director" ? "Envoyer au Director" : "Lancer la vidéo"}
            className="flex size-9 items-center justify-center rounded-full bg-text text-black transition-all hover:shadow-[0_0_20px_-2px_rgb(255_255_255/0.6)] active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint disabled:shadow-none"
          >
            {mode === "director" ? <ArrowUp className="size-4" /> : <WandSparkles className="size-4" />}
          </button>
        </div>
      </div>
    </form>
  );
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// Petit menu déroulant de la barre d'outils.
function Menu({
  label,
  options,
  value,
  onChange,
  openUp,
}: {
  label: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
  openUp: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm transition-colors ${
          open ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-3 hover:text-text"
        }`}
      >
        {label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`menu right-0 ${openUp ? "bottom-full mb-2" : "top-full mt-2"}`}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3"
            >
              <span className="flex-1">
                <span className="block">{o.label}</span>
                {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="size-4 text-accent-light" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex animate-fade-up gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_14px_-2px_var(--accent)]">
        <Sparkles className="size-3.5 text-white" />
      </span>
      <div className="min-w-0 pt-0.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-text/90">
        {children}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  credits,
  disabled,
  onLaunch,
}: {
  draft: DirectorDraft;
  credits: number;
  disabled: boolean;
  onLaunch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const durationSeconds = draft.shots.length * keptSeconds(draft.preset, draft.pace);
  const cost = costOf("video", durationSeconds, draft.preset, draft.pace);
  const tags = [
    findPreset(draft.preset)?.label,
    formatDuration(durationSeconds),
    draft.aspectRatio,
    `${draft.shots.length} plans`,
    PACES.find((p) => p.id === draft.pace)?.label,
    findTemplate(draft.templateId)?.label,
  ].filter(Boolean);

  return (
    <section className="panel glow ml-10 animate-fade-up p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent-light">Brouillon prêt</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{draft.title}</h2>
          <p className="mt-1 text-sm text-muted">{draft.brief}</p>
        </div>
        <button
          type="button"
          onClick={onLaunch}
          disabled={disabled || credits < cost}
          className="btn btn-accent"
        >
          <WandSparkles />
          Lancer · {cost} crédit{cost > 1 ? "s" : ""}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Masquer le storyboard" : "Voir le storyboard"}
      </button>
      {open && (
        <ol className="mt-3 flex flex-col divide-y divide-line border-y border-line">
          {draft.shots.map((shot, i) => (
            <li key={i} className="flex gap-3 py-2.5 text-sm">
              <span className="w-14 shrink-0 text-xs font-medium text-accent-light tabular-nums">
                Plan {i + 1}
              </span>
              <span className="text-muted">{shot.summary}</span>
            </li>
          ))}
        </ol>
      )}
      {credits < cost && (
        <p className="mt-3 text-xs text-danger">
          Pas assez de crédits ({credits} restant{credits > 1 ? "s" : ""}).
        </p>
      )}
    </section>
  );
}

function Result({
  phase,
  onReset,
  onCancel,
}: {
  phase: Exclude<Phase, { kind: "idle" }>;
  onReset: () => void;
  onCancel: () => void;
}) {
  const aspectRatio = phase.kind === "error" ? "9:16" : phase.job.aspectRatio;

  return (
    <section className="panel ml-10 animate-fade-up overflow-hidden">
      <div className="dot-bg flex justify-center p-6">
        {phase.kind === "error" ? (
          <p className="max-w-sm py-10 text-center text-sm text-danger">{phase.message}</p>
        ) : (
          <div
            className={`relative flex w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-xl border bg-black ${
              phase.kind === "generating" ? "glow" : "border-line"
            }`}
            style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
          >
            {phase.kind === "done" ? (
              phase.job.kind === "video" ? (
                <video
                  src={phase.view.mediaUrl}
                  poster={phase.view.posterUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="size-full object-cover"
                />
              ) : (
                // URL signée d'un bucket privé : pas d'optimisation Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={phase.view.mediaUrl} alt="Image générée" className="size-full object-cover" />
              )
            ) : (
              <>
                {phase.view?.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={phase.view.posterUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-40"
                  />
                )}
                <span className="pointer-events-none absolute inset-x-0 h-16 animate-scan bg-gradient-to-b from-transparent via-accent/25 to-transparent" />
                <div className="relative flex w-full flex-col items-center gap-3 px-5 text-center text-sm">
                  <span className="size-9 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                  <ProgressLabel phase={phase} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-3">
        {phase.kind === "generating" && phase.job.kind === "video" && phase.id && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            <X />
            Annuler
          </button>
        )}
        {phase.kind === "done" && (
          <a href={phase.view.downloadUrl ?? phase.view.mediaUrl} className="btn btn-primary">
            <Download />
            Télécharger
          </a>
        )}
        {phase.kind !== "generating" && (
          <button type="button" onClick={onReset} className="btn btn-secondary">
            <RefreshCw />
            Nouvelle vidéo
          </button>
        )}
      </div>
    </section>
  );
}

function ProgressLabel({ phase }: { phase: Extract<Phase, { kind: "generating" }> }) {
  const view = phase.view;
  if (!view || view.shotsTotal === 0) {
    return <span className="text-muted">Écriture du storyboard…</span>;
  }
  if (view.stage === "assembling") {
    return <span>Montage de la vidéo…</span>;
  }
  // Les images comptent pour la première moitié de la barre, l'animation
  // pour la seconde.
  const frames = view.stage === "frames";
  const done = frames ? view.framesDone : view.shotsDone;
  const progress = (done / view.shotsTotal / 2 + (frames ? 0 : 0.5)) * 100;
  return (
    <span className="w-full">
      {frames ? "Images des plans" : "Tournage des plans"} · {done}/{view.shotsTotal}
      <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className="relative block h-full overflow-hidden rounded-full bg-accent shadow-[0_0_12px_var(--accent)] transition-all duration-700 after:absolute after:inset-0 after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent"
          style={{ width: `${Math.max(progress, 4)}%` }}
        />
      </span>
      <span className="mt-2 block text-xs text-muted">
        Quelques minutes · tu retrouveras la vidéo ici en revenant
      </span>
    </span>
  );
}
