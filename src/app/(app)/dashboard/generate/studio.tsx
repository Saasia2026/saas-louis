"use client";

import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  Plus,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/conversations";
import type { DirectorHandoff, DirectorMessage } from "@/lib/director";
import {
  DEFAULT_PACE,
  DEFAULT_PRESET,
  FORMATS,
  keptSeconds,
  MAX_PROMPT_LENGTH,
  PACES,
  PRESETS,
  SWAP_ENGINES,
  costOf,
  swapCredits,
  swapShotCredits,
  findPreset,
  formatDuration,
  type AspectRatio,
  type GenerationKind,
  type SwapEngine,
  type Pace,
  type PresetId,
} from "@/lib/generation";
import { LogoMark } from "@/app/logo-mark";
import { fmt, plural } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { findTemplate, VIDEO_TEMPLATES, type VideoTemplate } from "@/lib/templates";
import {
  cancelVideo,
  directorChat,
  generate,
  getGeneration,
  type GenerationView,
} from "./actions";
import type { StyleReference } from "@/lib/reference";
import { ReferenceBanner, ReferenceButton } from "./reference-picker";
import { SwapInput, clampedStart, type SwapFile } from "./swap-input";
import { redoSwapShot, startSwap } from "./swap-actions";

const POLL_INTERVAL_MS: Record<GenerationKind, number> = { image: 3_000, video: 4_000, swap: 5_000 };
const MAX_MESSAGE_LENGTH = 2000;

// Environ 10 min de marge, plus le temps de rendu des plans.
function pollTimeoutMs(job: Job) {
  if (job.kind === "image") return 5 * 60_000;
  // Le remplacement rend le clip entier d'un coup : compter large (Genjutsu
  // met environ 45 s par seconde de clip).
  if (job.kind === "swap") return 20 * 60_000 + job.durationSeconds * 60_000;
  return 10 * 60_000 + job.durationSeconds * 5_000;
}

export type Job = { kind: GenerationKind; aspectRatio: AspectRatio; durationSeconds: number };

type Phase =
  | { kind: "idle" }
  | { kind: "generating"; job: Job; id: string; view?: GenerationView }
  | { kind: "done"; job: Job; id: string; view: GenerationView }
  | { kind: "error"; message: string };

type Active = { id: string; job: Job };
type Mode = "director" | "direct" | "swap";

// Studio : une seule zone de saisie. En mode Director, Claude sert de
// coéquipier : il aide à préciser l'idée et prépare un brief que le créateur
// envoie au mode Direct ou Remplacer. En mode Direct, la demande part telle
// quelle avec les réglages de la barre d'outils. Les réglages secondaires
// (style, rythme, personnage) restent repliés derrière le bouton +.
export function Studio({
  userId,
  credits,
  maxVideoSeconds,
  presets,
  characters,
  swapEngines,
  resume,
  conversation,
}: {
  userId: string;
  credits: number;
  maxVideoSeconds: number;
  // Préréglages disponibles (aucun sans FAL_KEY).
  presets: PresetId[];
  // Personnages prêts (Sora), réutilisables d'une vidéo à l'autre.
  characters: { id: string; name: string }[];
  // Moteurs du mode Remplacer disponibles, le meilleur en premier.
  swapEngines: SwapEngine[];
  // Vidéo encore en cours, reprise à l'ouverture de la page.
  resume?: Active;
  // Discussion du Director rouverte (?c=), ou rien pour une nouvelle.
  conversation: Conversation | null;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
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

  // Mode Remplacer : clip filmé et image du personnage, déjà déposés.
  const [swapVideo, setSwapVideo] = useState<SwapFile | null>(null);
  const [swapImage, setSwapImage] = useState<SwapFile | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const [swapEngine, setSwapEngine] = useState<SwapEngine>(swapEngines[0] ?? "kling");

  // Discussion avec le Director.
  const [conversationId, setConversationId] = useState(conversation?.id ?? null);
  const [messages, setMessages] = useState<DirectorMessage[]>(conversation?.messages ?? []);
  const [handoff, setHandoff] = useState<DirectorHandoff | null>(conversation?.handoff ?? null);
  // Réponses rapides proposées par le Director à son dernier message.
  const [ideas, setIdeas] = useState<string[]>(conversation?.ideas ?? []);
  // Brief déjà reporté dans le mode Direct ou Remplacer.
  const [applied, setApplied] = useState<DirectorHandoff | null>(null);
  const [pending, setPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  // Vidéo de référence : le Director écrit dans son style, et en mode Direct
  // Kling O1 la reçoit à chaque plan (seul préréglage possible).
  const [reference, setReference] = useState<
    (StyleReference & { referencePath: string }) | null
  >(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Génération en cours.
  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);

  // Autre discussion choisie dans la barre latérale (ou « Nouvelle vidéo ») :
  // on repart de son contenu. Quand l'URL suit simplement la discussion
  // en cours (création au premier message), rien ne change.
  const incomingId = conversation?.id ?? null;
  const [syncedId, setSyncedId] = useState(incomingId);
  if (incomingId !== syncedId) {
    setSyncedId(incomingId);
    if (incomingId !== conversationId) {
      setConversationId(incomingId);
      setMessages(conversation?.messages ?? []);
      setHandoff(conversation?.handoff ?? null);
      setIdeas(conversation?.ideas ?? []);
      setApplied(null);
      setChatError(null);
      setText("");
      setMode("director");
      if (phase.kind !== "generating") setPhase({ kind: "idle" });
    }
  }

  const threadEnd = useRef<HTMLDivElement>(null);
  const busy = phase.kind === "generating";

  const directPresets: PresetId[] = reference && presets.length ? ["reference"] : presets;
  const activePreset = directPresets.includes(preset) ? preset : (directPresets[0] ?? preset);

  // La durée tombe toujours juste sur la longueur d'un plan.
  const step = keptSeconds(activePreset, pace);
  const duration = Math.max(step, Math.round(durationSeconds / step) * step);
  const directCost = costOf("video", duration, activePreset, pace);

  // Durée illisible dans le navigateur : on affiche le coût maximal. Le prix
  // affiché suppose un clip à 30 images/s ; le serveur débite d'après sa
  // propre mesure de la durée et de la cadence.
  // Un clip plus long est découpé au passage choisi.
  const swapMaxSeconds = SWAP_ENGINES[swapEngine].maxSeconds;
  // Même arrondi que le serveur (voir startSwap) : Genjutsu se paie à la
  // seconde entamée.
  const swapDurationKnown = Number.isFinite(swapVideo?.seconds);
  const swapClipSeconds = Math.min(swapMaxSeconds, swapDurationKnown ? swapVideo!.seconds! : NaN);
  const swapSeconds = swapDurationKnown
    ? Math.max(
        1,
        swapEngine === "genjutsu" ? Math.ceil(swapClipSeconds - 0.05) : Math.round(swapClipSeconds),
      )
    : swapMaxSeconds;
  const swapCost = swapCredits(swapSeconds, swapEngine);
  // Durée illisible : le serveur mesure le clip et refuse lui-même faute de
  // crédits ; on ne bloque ici que sous le prix le plus bas.
  const swapGate = swapDurationKnown ? swapCost : swapCredits(1, swapEngine);

  const started = messages.length > 0 || phase.kind !== "idle";

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, handoff, phase.kind]);

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
        return finish({ kind: "done", job, id, view });
      }
      if (view.status === "failed") {
        return finish({
          kind: "error",
          message:
            view.error ?? t.studio.failed,
        });
      }
      setPhase({ kind: "generating", job, id, view });
      if (Date.now() > deadline) {
        return finish({
          kind: "error",
          message: t.studio.tooLong,
        });
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS[job.kind]);
    }

    timer = setTimeout(tick, resume?.id === id ? 0 : POLL_INTERVAL_MS[job.kind]);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, resume, router, t]);

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
        preset: activePreset,
        pace,
        characterId,
        referencePath: reference?.referencePath,
        styleReference: reference?.direction,
      }),
    );
  }

  async function launchSwap() {
    if (!swapVideo || !swapImage) return;
    setPhase({
      kind: "generating",
      job: { kind: "swap", aspectRatio: "9:16", durationSeconds: swapSeconds },
      id: "",
    });
    const res = await startSwap({
      videoPath: swapVideo.path,
      imagePath: swapImage.path,
      start: clampedStart(swapVideo, swapMaxSeconds),
      target: swapTarget.trim() || undefined,
      engine: swapEngine,
    });
    router.refresh();
    if (res.error !== undefined) {
      setPhase({ kind: "error", message: res.error });
      return;
    }
    const job: Job = {
      kind: "swap",
      aspectRatio: res.data.aspectRatio,
      durationSeconds: res.data.durationSeconds,
    };
    setPhase({ kind: "generating", job, id: res.data.generationId });
    setActive({ id: res.data.generationId, job });
  }

  // Reporte le brief du Director dans le mode choisi, sans rien lancer :
  // le créateur relit, ajuste et lance lui-même.
  function applyHandoff(value: DirectorHandoff) {
    setShowSettings(false);
    setApplied(value);
    if (value.mode === "swap") {
      setMode("swap");
      return;
    }
    setMode("direct");
    setText(value.prompt);
    setTemplate(findTemplate(value.templateId) ?? VIDEO_TEMPLATES[0]);
    if (presets.includes(value.preset)) setPreset(value.preset);
    setPace(value.pace);
    setAspectRatio(value.aspectRatio);
    setDurationSeconds(Math.min(value.durationSeconds, maxVideoSeconds));
  }

  async function sendToDirector(content: string) {
    const next: DirectorMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setChatError(null);
    setPending(true);
    setIdeas([]);
    const res = await directorChat({
      messages: next,
      conversationId,
      current: handoff,
      styleReference: reference?.direction,
    });
    setPending(false);
    if (res.error !== undefined) {
      // Le message non traité revient dans le champ pour être renvoyé.
      setMessages(messages);
      setText(content);
      setChatError(res.error);
      return;
    }
    setMessages([...next, { role: "assistant", content: res.data.reply }]);
    setIdeas(res.data.ideas);
    setHandoff(res.data.handoff);
    if (res.data.conversationId) {
      if (res.data.conversationId !== conversationId) {
        setConversationId(res.data.conversationId);
        window.history.replaceState(null, "", `?c=${res.data.conversationId}`);
      }
      router.refresh(); // titre et ordre de la barre latérale
    }
  }

  const canSend =
    mode === "swap"
      ? !busy && Boolean(swapVideo && swapImage) && credits >= swapGate
      : text.trim().length > 0 &&
        (mode === "director" ? !pending : !busy && credits >= directCost);

  function submit() {
    if (!canSend) return;
    if (mode === "swap") {
      launchSwap();
      return;
    }
    const content = text.trim();
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
          ? handoff
            ? t.studio.placeholderDirectorBrief
            : t.studio.placeholderDirector
          : t.templates[template.id as keyof typeof t.templates]?.placeholder ?? template.placeholder
      }
      showSettings={showSettings}
      onToggleSettings={() => setShowSettings((v) => !v)}
      openUp={started}
      banner={
        mode !== "swap" && reference ? (
          <ReferenceBanner reference={reference} onRemove={() => setReference(null)} />
        ) : undefined
      }
      input={
        mode === "swap" ? (
          <SwapInput
            userId={userId}
            video={swapVideo}
            image={swapImage}
            onVideo={setSwapVideo}
            onImage={setSwapImage}
            target={swapTarget}
            onTarget={setSwapTarget}
            maxSeconds={swapMaxSeconds}
            compact={started}
          />
        ) : undefined
      }
      tools={
        mode === "direct" ? (
          <>
            <Menu
              label={t.presets[activePreset].label}
              openUp={started}
              options={PRESETS.filter((p) => directPresets.includes(p.id)).map((p) => ({
                value: p.id,
                label: t.presets[p.id].label,
                hint: t.presets[p.id].hint,
              }))}
              value={activePreset}
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
            <ReferenceButton
              userId={userId}
              busy={analyzing}
              onBusy={setAnalyzing}
              onReference={setReference}
              onError={setChatError}
              compact
            />
            <Menu
              label={aspectRatio}
              openUp={started}
              options={FORMATS.map((f) => ({
                value: f.value,
                label: t.formats[f.value].label,
                hint: t.formats[f.value].hint,
              }))}
              value={aspectRatio}
              onChange={(v) => setAspectRatio(v as AspectRatio)}
            />
          </>
        ) : mode === "director" ? (
          <ReferenceButton
            userId={userId}
            busy={analyzing}
            onBusy={setAnalyzing}
            onReference={setReference}
            onError={setChatError}
          />
        ) : swapEngines.length > 1 ? (
          <Menu
            label={t.swapEngines[swapEngine].label}
            openUp={started}
            options={swapEngines.map((e) => ({
              value: e,
              label: t.swapEngines[e].label,
              hint: fmt(t.swapEngines[e].hint, {
                max: SWAP_ENGINES[e].maxSeconds,
                rate: SWAP_ENGINES[e].creditsPerSecond.toLocaleString(locale),
              }),
            }))}
            value={swapEngine}
            onChange={(v) => setSwapEngine(v as SwapEngine)}
          />
        ) : null
      }
      status={
        mode === "swap"
          ? !swapVideo || !swapImage
            ? t.studio.swapPick
            : credits >= swapGate
                ? `${swapDurationKnown ? "≈" : "≤"} ${swapCost} ${plural(swapCost, t.common.credit, t.common.credits)}`
                : t.studio.notEnoughCredits
          : mode === "direct"
          ? credits >= directCost
            ? `${directCost} ${plural(directCost, t.common.credit, t.common.credits)}`
            : t.studio.notEnoughCredits
          : t.studio.directorStatus
      }
      settings={
        <div className="flex flex-col gap-4">
          {mode === "direct" && (
            <SettingGroup label={t.studio.style}>
              {VIDEO_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  title={t.templates[tpl.id as keyof typeof t.templates]?.hint}
                  aria-pressed={template.id === tpl.id}
                  onClick={() => pickTemplate(tpl)}
                  className="chip"
                >
                  {t.templates[tpl.id as keyof typeof t.templates]?.label ?? tpl.label}
                </button>
              ))}
            </SettingGroup>
          )}
          {mode === "direct" && (
            <SettingGroup label={t.studio.pace}>
              {PACES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={t.paces[p.id].hint}
                  aria-pressed={pace === p.id}
                  onClick={() => setPace(p.id)}
                  className="chip"
                >
                  {t.paces[p.id].label}
                </button>
              ))}
            </SettingGroup>
          )}
          <SettingGroup label={t.studio.character}>
            <button
              type="button"
              aria-pressed={!characterId}
              onClick={() => setCharacterId(undefined)}
              className="chip"
            >
              {t.studio.none}
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
              <span className="text-xs text-faint">{t.studio.noCharacter}</span>
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
            <LogoMark className="size-11 shrink-0 sm:size-14" />
            <span className="text-gradient">{t.studio.title}</span>
          </h1>
          <p className="mt-4 animate-fade-up text-center text-[0.9375rem] text-muted [animation-delay:80ms]">
            {t.studio.subtitle}
          </p>

          <div className="relative z-20 mt-10 w-full max-w-3xl animate-fade-up [animation-delay:160ms]">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-16 -inset-y-12 -z-10 animate-aurora rounded-full bg-[radial-gradient(closest-side,rgb(91_124_255/0.28),transparent)] blur-2xl"
            />
            {composer}
            {chatError && messages.length === 0 && (
              <p className="mt-3 text-center text-sm text-danger">{chatError}</p>
            )}
          </div>

          {mode !== "swap" && (
            <div className="mt-6 flex max-w-3xl animate-fade-up flex-wrap justify-center gap-2 [animation-delay:240ms]">
              {t.studio.ideas.map((idea) => (
                <button key={idea} type="button" onClick={() => setText(idea)} className="chip">
                  {idea}
                </button>
              ))}
            </div>
          )}
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
                <span className="inline-flex gap-1 py-1.5" aria-label={t.studio.directorTyping}>
                  <span className="size-1.5 animate-pulse rounded-full bg-muted" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
                </span>
              </AssistantMessage>
            )}
            {chatError && <p className="text-sm text-danger">{chatError}</p>}

            {!pending && ideas.length > 0 && (
              <div className="ml-10 flex animate-fade-up flex-wrap gap-2">
                {ideas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => {
                      setMode("director");
                      sendToDirector(idea);
                    }}
                    className="chip"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}

            {handoff && (
              <HandoffCard
                handoff={handoff}
                applied={applied === handoff && mode === handoff.mode}
                onApply={() => applyHandoff(handoff)}
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
                credits={credits}
                onRedo={async (index) => {
                  if (phase.kind !== "done") return;
                  const id = phase.id;
                  const res = await redoSwapShot({ generationId: id, index });
                  router.refresh();
                  if (res.error !== undefined) {
                    setPhase({ kind: "error", message: res.error });
                    return;
                  }
                  const job: Job = { kind: "swap", ...res.data };
                  setPhase({ kind: "generating", job, id });
                  setActive({ id, job });
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
  banner,
  input,
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
  // Au-dessus de la zone de texte (vidéo de référence).
  banner?: React.ReactNode;
  // Remplace la zone de texte (mode Remplacer).
  input?: React.ReactNode;
  tools: React.ReactNode;
  status: string;
  showSettings: boolean;
  onToggleSettings: () => void;
  settings: React.ReactNode;
  openUp: boolean;
}) {
  const { t } = useI18n();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="composer"
    >
      {banner}
      {input ?? (
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
        aria-label={t.studio.inputLabel}
        className={`field-sizing-content block max-h-60 w-full ${openUp ? "min-h-12" : "min-h-24"} resize-none bg-transparent px-5 pt-4 pb-2 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint`}
      />
      )}

      {showSettings && !input && (
        <div className="mx-4 mb-2 animate-fade-up rounded-xl border border-line bg-surface-2/70 p-4 [animation-duration:200ms]">
          {settings}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        {!input && (
        <button
          type="button"
          onClick={onToggleSettings}
          aria-expanded={showSettings}
          title={t.studio.moreSettings}
          className={`flex size-8 items-center justify-center rounded-full border transition-all ${
            showSettings
              ? "rotate-45 border-accent/60 bg-accent/15 text-accent-light"
              : "border-line bg-surface-3 text-muted hover:text-text"
          }`}
        >
          <Plus className="size-4" />
        </button>
        )}

        <div className="flex rounded-full border border-line bg-surface-2 p-0.5 text-sm">
          {(
            [
              { value: "director", label: t.studio.modeDirector, hint: t.studio.modeDirectorHint },
              { value: "direct", label: t.studio.modeDirect, hint: t.studio.modeDirectHint },
              { value: "swap", label: t.studio.modeSwap, hint: t.studio.modeSwapHint },
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
            title={mode === "director" ? t.studio.sendDirector : t.studio.launchVideo}
            className="flex size-9 items-center justify-center rounded-full bg-text text-bg transition-all hover:shadow-[0_0_20px_-2px_rgb(255_255_255/0.6)] active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint disabled:shadow-none"
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

// Brief préparé par le Director : le créateur l'envoie lui-même au mode
// Direct (prompt et réglages préremplis) ou Remplacer (quoi filmer).
function HandoffCard({
  handoff,
  applied,
  onApply,
}: {
  handoff: DirectorHandoff;
  applied: boolean;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const swap = handoff.mode === "swap";
  const template = findTemplate(handoff.templateId);
  const tags = swap
    ? [t.studio.modeSwap]
    : [
        t.studio.modeDirect,
        findPreset(handoff.preset) && t.presets[handoff.preset].label,
        formatDuration(handoff.durationSeconds),
        handoff.aspectRatio,
        PACES.some((p) => p.id === handoff.pace) && t.paces[handoff.pace].label,
        template && (t.templates[template.id as keyof typeof t.templates]?.label ?? template.label),
      ].filter((tag): tag is string => Boolean(tag));

  async function copy() {
    try {
      await navigator.clipboard.writeText(handoff.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Presse-papiers refusé : le texte reste sélectionnable.
    }
  }

  return (
    <section className="panel glow ml-10 animate-fade-up p-5">
      <p className="text-xs font-medium text-accent-light">{t.studio.briefReady}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{handoff.title}</h2>
      {handoff.why && <p className="mt-1 text-sm text-muted">{handoff.why}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium text-muted">
        {swap ? t.studio.briefToFilm : t.studio.briefPrompt}
      </p>
      <p className="mt-1.5 rounded-xl border border-line bg-surface-2/70 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap select-text">
        {handoff.prompt}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={copy} className="btn btn-secondary">
          {copied ? <Check /> : <Copy />}
          {copied ? t.studio.copied : t.studio.copy}
        </button>
        <button type="button" onClick={onApply} className="btn btn-accent">
          {applied ? <Check /> : <ArrowRight />}
          {applied ? t.studio.briefApplied : swap ? t.studio.useInSwap : t.studio.useInDirect}
        </button>
      </div>
    </section>
  );
}

function Result({
  phase,
  onReset,
  onCancel,
  credits,
  onRedo,
}: {
  phase: Exclude<Phase, { kind: "idle" }>;
  onReset: () => void;
  onCancel: () => void;
  credits: number;
  // Refait un plan d'un remplacement terminé.
  onRedo: (index: number) => void;
}) {
  const { t } = useI18n();
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
              phase.job.kind !== "image" ? (
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
                <img src={phase.view.mediaUrl} alt={t.studio.generatedImage} className="size-full object-cover" />
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

      {phase.kind === "done" && phase.view.swapParts && phase.view.swapParts.length > 1 && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-xs text-muted">{t.studio.swapRedoTitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {phase.view.swapParts.map((part, i) => {
              const cost = swapShotCredits(part.seconds);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={credits < cost}
                  onClick={() => onRedo(i)}
                  title={fmt(t.studio.swapRedo, {
                    n: i + 1,
                    cost,
                    credits: plural(cost, t.common.credit, t.common.credits),
                  })}
                  className={`chip ${part.flagged ? "border-amber-500/60 text-amber-300" : ""}`}
                >
                  {fmt(t.studio.swapShot, { n: i + 1 })} · {part.start.toFixed(1)}–
                  {(part.start + part.seconds).toFixed(1)} s
                  {part.flagged && ` · ${t.studio.swapShotFlagged}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-3">
        {phase.kind === "generating" && phase.job.kind === "video" && phase.id && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            <X />
            {t.studio.cancel}
          </button>
        )}
        {phase.kind === "done" && (
          <a href={phase.view.downloadUrl ?? phase.view.mediaUrl} className="btn btn-primary">
            <Download />
            {t.studio.download}
          </a>
        )}
        {phase.kind !== "generating" && (
          <button type="button" onClick={onReset} className="btn btn-secondary">
            <RefreshCw />
            {t.studio.newVideo}
          </button>
        )}
      </div>
    </section>
  );
}

function ProgressLabel({ phase }: { phase: Extract<Phase, { kind: "generating" }> }) {
  const { t } = useI18n();
  const view = phase.view;
  // Remplacement : images clés des plans, puis vidéo et contrôle de chacun.
  if (
    phase.job.kind === "swap" &&
    view &&
    view.swapEngine !== "genjutsu" &&
    view.shotsTotal > 0 &&
    view.stage !== "assembling"
  ) {
    const keyframes = view.framesDone < view.shotsTotal;
    const done = keyframes ? view.framesDone : view.shotsDone;
    const progress = (done / view.shotsTotal / 2 + (keyframes ? 0 : 0.5)) * 100;
    return (
      <span className="w-full">
        {keyframes ? t.studio.swapKeyframes : t.studio.swapShots} · {done}/{view.shotsTotal}
        <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-3">
          <span
            className="block h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </span>
        <span className="mt-2 block text-xs text-muted">{t.studio.progressHint}</span>
      </span>
    );
  }
  if (phase.job.kind === "swap" && view?.stage !== "assembling") {
    return (
      <span className="w-full">
        {t.studio.swapping}
        <span className="mt-2 block text-xs text-muted">
          {view?.swapEngine === "genjutsu"
            ? fmt(t.studio.swapGenjutsuHint, {
                minutes: Math.max(2, Math.ceil(phase.job.durationSeconds * 0.75)),
              })
            : t.studio.progressHint}
        </span>
      </span>
    );
  }
  if (!view || view.shotsTotal === 0) {
    return <span className="text-muted">{t.studio.writingStoryboard}</span>;
  }
  if (view.stage === "assembling") {
    return <span>{t.studio.assembling}</span>;
  }
  // Les images comptent pour la première moitié de la barre, l'animation
  // pour la seconde.
  const frames = view.stage === "frames";
  const done = frames ? view.framesDone : view.shotsDone;
  const progress = (done / view.shotsTotal / 2 + (frames ? 0 : 0.5)) * 100;
  return (
    <span className="w-full">
      {frames ? t.studio.framing : t.studio.filming} · {done}/{view.shotsTotal}
      <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className="relative block h-full overflow-hidden rounded-full bg-accent shadow-[0_0_12px_var(--accent)] transition-all duration-700 after:absolute after:inset-0 after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent"
          style={{ width: `${Math.max(progress, 4)}%` }}
        />
      </span>
      <span className="mt-2 block text-xs text-muted">
        {t.studio.progressHint}
      </span>
    </span>
  );
}
