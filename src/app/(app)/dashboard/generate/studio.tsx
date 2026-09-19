"use client";

import { Check, ChevronDown, Download, RefreshCw, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/app/logo-mark";
import { fmt, plural } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  SWAP_ENGINES,
  swapCredits,
  swapShotCredits,
  type AspectRatio,
  type SwapEngine,
} from "@/lib/generation";
import { getGeneration, type GenerationView } from "./actions";
import { redoSwapShot, startSwap } from "./swap-actions";
import { SwapInput, clampedStart, type SwapFile } from "./swap-input";

const POLL_INTERVAL_MS = 5_000;
// Durée annoncée d'un rendu Genjutsu. Les séquences se rendent en même temps
// (quelques minutes, quelle que soit la longueur), mais la préparation, les
// contrôles et le montage croissent avec le clip.
function genjutsuMinutes(seconds: number) {
  return seconds <= 15 ? 5 : seconds <= 30 ? 6 : seconds <= 60 ? 8 : 10;
}
// Durées de passage proposées, en plus du clip entier : un essai court coûte
// peu (surtout en Qualité max, facturé à la seconde).
const LENGTHS = [5, 10, 15, 30, 60];

// Les séquences se rendent en même temps : quelques minutes, plus la file
// d'attente du fournisseur. Compter large : au-delà, la vidéo se retrouve
// dans Mes vidéos.
function pollTimeoutMs(job: Job) {
  return 30 * 60_000 + job.durationSeconds * 20_000;
}

export type Job = { aspectRatio: AspectRatio; durationSeconds: number };

type Phase =
  | { kind: "idle" }
  | { kind: "generating"; job: Job; id: string; view?: GenerationView }
  | { kind: "done"; job: Job; id: string; view: GenerationView }
  // tryBudget : seul le moteur Qualité max a échoué, l'Économique peut prendre le relais.
  | { kind: "error"; message: string; tryBudget?: boolean };

type Active = { id: string; job: Job };

// Studio : un clip filmé, l'image d'un personnage, et le personnage prend la
// place de la personne du clip (voir startSwap). Rien d'autre à régler que le
// moteur, quand il y en a plusieurs.
export function Studio({
  userId,
  credits,
  engines,
  resume,
}: {
  userId: string;
  credits: number;
  // Moteurs disponibles, le meilleur en premier.
  engines: SwapEngine[];
  // Remplacement encore en cours, repris à l'ouverture de la page.
  resume?: Active;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();

  // Clip filmé et image du personnage, déjà déposés.
  const [video, setVideo] = useState<SwapFile | null>(null);
  const [image, setImage] = useState<SwapFile | null>(null);
  const [target, setTarget] = useState("");
  const [engine, setEngine] = useState<SwapEngine>(engines[0] ?? "kling");
  // Durée du passage choisie ; rien = tout le clip, dans la limite du moteur.
  const [length, setLength] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);

  const resultEnd = useRef<HTMLDivElement>(null);
  const busy = phase.kind === "generating";
  const started = phase.kind !== "idle";

  // Un clip plus long est découpé au passage choisi. Même arrondi que le
  // serveur (voir startSwap). Le prix final dépend du découpage du clip, fait
  // par le serveur : celui-ci est le plus bas possible.
  const engineMax = SWAP_ENGINES[engine].maxSeconds;
  const maxSeconds = Math.min(engineMax, length ?? engineMax);
  const durationKnown = Number.isFinite(video?.seconds);
  const lengths = LENGTHS.filter((l) => l < engineMax && (!durationKnown || l < video!.seconds!));
  const wholeSeconds = durationKnown ? Math.min(engineMax, Math.floor(video!.seconds!)) : engineMax;
  const clipSeconds = Math.min(maxSeconds, durationKnown ? video!.seconds! : NaN);
  const seconds = durationKnown
    ? Math.max(1, Math.round(clipSeconds))
    : maxSeconds;
  const cost = swapCredits(seconds, engine);
  // Durée illisible dans le navigateur : le serveur mesure le clip et refuse
  // lui-même faute de crédits ; on ne bloque ici que sous le prix le plus bas.
  const gate = durationKnown ? cost : swapCredits(1, engine);
  const canSend = !busy && Boolean(video && image) && credits >= gate;

  useEffect(() => {
    resultEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [phase.kind]);

  // Suivi du remplacement actif. Sans webhook joignable, c'est aussi ce suivi
  // qui le fait avancer.
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
          message: view.error ?? t.studio.failed,
          tryBudget: view.tryBudget && engines.includes("kling"),
        });
      }
      setPhase({ kind: "generating", job, id, view });
      if (Date.now() > deadline) return finish({ kind: "error", message: t.studio.tooLong });
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    timer = setTimeout(tick, resume?.id === id ? 0 : POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, resume, router, t, engines]);

  async function launch() {
    if (!canSend || !video || !image) return;
    setPhase({ kind: "generating", job: { aspectRatio: "9:16", durationSeconds: seconds }, id: "" });
    const res = await startSwap({
      videoPath: video.path,
      imagePath: image.path,
      start: clampedStart(video, maxSeconds),
      seconds: maxSeconds,
      target: target.trim() || undefined,
      engine,
    });
    router.refresh();
    if (res.error !== undefined) {
      setPhase({ kind: "error", message: res.error });
      return;
    }
    const job: Job = {
      aspectRatio: res.data.aspectRatio,
      durationSeconds: res.data.durationSeconds,
    };
    setPhase({ kind: "generating", job, id: res.data.generationId });
    setActive({ id: res.data.generationId, job });
  }

  async function redo(index: number) {
    if (phase.kind !== "done") return;
    const id = phase.id;
    const res = await redoSwapShot({ generationId: id, index });
    router.refresh();
    if (res.error !== undefined) {
      setPhase({ kind: "error", message: res.error });
      return;
    }
    setPhase({ kind: "generating", job: res.data, id });
    setActive({ id, job: res.data });
  }

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        launch();
      }}
      className="composer"
    >
      <SwapInput
        userId={userId}
        video={video}
        image={image}
        onVideo={(file) => {
          setVideo(file);
          // Autre clip : la durée choisie pour le précédent ne vaut plus.
          if (file?.path !== video?.path) setLength(null);
        }}
        onImage={setImage}
        target={target}
        onTarget={setTarget}
        maxSeconds={maxSeconds}
        compact={started}
      />

      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        {engines.length > 1 && (
          <Menu
            label={t.swapEngines[engine].label}
            openUp={started}
            options={engines.map((e) => ({
              value: e,
              label: t.swapEngines[e].label,
              hint: fmt(t.swapEngines[e].hint, {
                max: SWAP_ENGINES[e].maxSeconds,
                rate: SWAP_ENGINES[e].creditsPerSecond.toLocaleString(locale),
              }),
            }))}
            value={engine}
            onChange={(v) => setEngine(v as SwapEngine)}
          />
        )}
        {video && lengths.length > 0 && (
          <Menu
            label={
              length && length < engineMax
                ? `${length} s`
                : fmt(t.studio.lengthAll, { seconds: wholeSeconds })
            }
            openUp={started}
            options={[
              ...lengths.map((l) => ({ value: String(l), label: `${l} s` })),
              { value: "all", label: fmt(t.studio.lengthAll, { seconds: wholeSeconds }) },
            ]}
            value={length && length < engineMax ? String(length) : "all"}
            onChange={(v) => setLength(v === "all" ? null : Number(v))}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="px-1 text-xs text-faint">
            {!video || !image
              ? t.studio.pick
              : credits >= gate
                ? durationKnown
                  ? // Prix final connu une fois le clip découpé (voir swapCredits).
                    fmt(t.studio.costFrom, {
                      cost,
                      credits: plural(cost, t.common.credit, t.common.credits),
                    })
                  : `≤ ${cost} ${plural(cost, t.common.credit, t.common.credits)}`
                : t.studio.notEnoughCredits}
          </span>
          <button type="submit" disabled={!canSend} className="btn btn-accent">
            <WandSparkles />
            {t.studio.launch}
          </button>
        </div>
      </div>
    </form>
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
          <p className="mt-4 max-w-xl animate-fade-up text-center text-[0.9375rem] text-muted [animation-delay:80ms]">
            {t.studio.subtitle}
          </p>

          <div className="relative z-20 mt-10 w-full max-w-3xl animate-fade-up [animation-delay:160ms]">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-16 -inset-y-12 -z-10 animate-aurora rounded-full bg-[radial-gradient(closest-side,rgb(91_124_255/0.28),transparent)] blur-2xl"
            />
            {composer}
          </div>

          <ol className="mt-6 flex max-w-3xl animate-fade-up flex-wrap justify-center gap-2 [animation-delay:240ms]">
            {t.studio.steps.map((step, i) => (
              <li key={step} className="tag">
                <span className="mr-1.5 text-accent-light tabular-nums">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 pt-4 pb-6">
            <Result
              phase={phase}
              credits={credits}
              onReset={() => setPhase({ kind: "idle" })}
              onRedo={redo}
              onTryBudget={() => {
                // Même clip, même personnage : il ne reste qu'à relancer.
                setEngine("kling");
                setPhase({ kind: "idle" });
              }}
            />
            <div ref={resultEnd} />
          </div>

          {/* Sous le résultat, pas par-dessus : ses boutons restent visibles. */}
          <div className="mx-auto w-full max-w-3xl pb-6">{composer}</div>
        </>
      )}
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
        <div className={`menu left-0 ${openUp ? "bottom-full mb-2" : "top-full mt-2"}`}>
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

function Result({
  phase,
  credits,
  onReset,
  onRedo,
  onTryBudget,
}: {
  phase: Exclude<Phase, { kind: "idle" }>;
  credits: number;
  onReset: () => void;
  // Refait un plan d'un remplacement terminé (moteur kling).
  onRedo: (index: number) => void;
  // Repasse en Économique après un échec du moteur Qualité max.
  onTryBudget: () => void;
}) {
  const { t } = useI18n();
  const aspectRatio = phase.kind === "error" ? "9:16" : phase.job.aspectRatio;

  return (
    <section className="panel animate-fade-up overflow-hidden">
      <div className="dot-bg flex justify-center p-6">
        {phase.kind === "error" ? (
          <p className="max-w-sm py-10 text-center text-sm text-danger">{phase.message}</p>
        ) : (
          <div
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border bg-black ${
              aspectRatio === "16:9" ? "max-w-xl" : "max-w-[16rem]"
            } ${phase.kind === "generating" ? "glow" : "border-line"}`}
            style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
          >
            {phase.kind === "done" ? (
              <video
                src={phase.view.mediaUrl}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-cover"
              />
            ) : (
              <>
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

      {phase.kind === "done" && phase.view.parts.length > 1 && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-xs text-muted">
            {phase.view.engine === "genjutsu" ? t.studio.redoSequenceTitle : t.studio.redoTitle}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {phase.view.parts.map((part, i) => {
              const sequence = phase.view.engine === "genjutsu";
              const cost = swapShotCredits(part.seconds, phase.view.engine);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={credits < cost}
                  onClick={() => onRedo(i)}
                  title={fmt(sequence ? t.studio.redoSequence : t.studio.redo, {
                    n: i + 1,
                    cost,
                    credits: plural(cost, t.common.credit, t.common.credits),
                  })}
                  className={`chip ${part.flagged ? "border-amber-500/60 text-amber-300" : ""}`}
                >
                  {fmt(sequence ? t.studio.sequence : t.studio.shot, { n: i + 1 })} ·{" "}
                  {part.start.toFixed(1)}–
                  {(part.start + part.seconds).toFixed(1)} s
                  {part.flagged && ` · ${t.studio.shotFlagged}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-3">
        {phase.kind === "done" && (
          <a href={phase.view.downloadUrl ?? phase.view.mediaUrl} className="btn btn-primary">
            <Download />
            {t.studio.download}
          </a>
        )}
        {phase.kind === "error" && phase.tryBudget && (
          <button type="button" onClick={onTryBudget} className="btn btn-accent">
            <WandSparkles />
            {t.studio.tryBudget}
          </button>
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
  if (view?.stage === "assembling") return <span>{t.studio.assembling}</span>;

  // Kling : images clés des plans, puis vidéo et contrôle de chacun.
  if (view && view.engine === "kling" && view.shotsTotal > 0) {
    const keyframes = view.framesDone < view.shotsTotal;
    const done = keyframes ? view.framesDone : view.shotsDone;
    const progress = (done / view.shotsTotal / 2 + (keyframes ? 0 : 0.5)) * 100;
    return (
      <span className="w-full">
        {keyframes ? t.studio.keyframes : t.studio.shots} · {done}/{view.shotsTotal}
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

  // Genjutsu : les séquences se rendent toutes en même temps.
  const sequences = view?.engine === "genjutsu" && view.shotsTotal > 1;
  return (
    <span className="w-full">
      {sequences ? `${t.studio.sequences} · ${view.shotsDone}/${view.shotsTotal}` : t.studio.swapping}
      {sequences && (
        <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-3">
          <span
            className="block h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${Math.max((view.shotsDone / view.shotsTotal) * 100, 4)}%` }}
          />
        </span>
      )}
      <span className="mt-2 block text-xs text-muted">
        {view?.engine === "genjutsu"
          ? fmt(t.studio.genjutsuHint, { minutes: genjutsuMinutes(phase.job.durationSeconds) })
          : t.studio.progressHint}
      </span>
    </span>
  );
}
