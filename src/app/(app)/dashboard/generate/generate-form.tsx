"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DEFAULT_PACE,
  DEFAULT_PRESET,
  FORMATS,
  keptSeconds,
  MAX_PROMPT_LENGTH,
  PACES,
  PRESETS,
  PROMPT_SUGGESTIONS,
  VIDEO_STEP_SECONDS,
  costOf,
  formatDuration,
  type AspectRatio,
  type GenerationKind,
  type Pace,
  type PresetId,
} from "@/lib/generation";
import { VIDEO_TEMPLATES, type VideoTemplate } from "@/lib/templates";
import {
  cancelVideo,
  generate,
  getGeneration,
  launchDirectorVideo,
  type GenerationView,
} from "./actions";
import { DirectorChat } from "./director-chat";

const POLL_INTERVAL_MS: Record<GenerationKind, number> = { image: 3_000, video: 4_000 };

// Environ 10 min de marge, plus le temps de rendu des plans. Le délai repart
// de zéro tant que l'utilisateur valide son storyboard.
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

export function GenerateForm({
  twinId,
  credits,
  maxVideoSeconds,
  presets,
  characters,
  resume,
}: {
  // Sans jumeau, la vidéo est générée depuis le texte seul et la photo est
  // indisponible.
  twinId?: string;
  credits: number;
  maxVideoSeconds: number;
  // Préréglages disponibles (ceux de fal seulement si FAL_KEY est défini).
  presets: PresetId[];
  // Personnages prêts (Sora), réutilisables d'une vidéo à l'autre.
  characters: { id: string; name: string }[];
  // Vidéo encore en cours pour ce jumeau, reprise à l'ouverture de la page.
  resume?: Active;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<GenerationKind>("video");
  const twinMode = Boolean(twinId);
  const [durationSeconds, setDurationSeconds] = useState(Math.min(15, maxVideoSeconds));
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [template, setTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [preset, setPreset] = useState<PresetId>(
    presets.includes(DEFAULT_PRESET) ? DEFAULT_PRESET : (presets[0] ?? DEFAULT_PRESET),
  );
  const [mode, setMode] = useState<"director" | "form">("director");
  const [pace, setPace] = useState<Pace>(DEFAULT_PACE);
  const [characterId, setCharacterId] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);

  const cost = costOf(kind, durationSeconds, preset, pace);
  const busy = phase.kind === "generating";
  const canSubmit = !busy && credits >= cost && prompt.trim().length > 0;

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
      router.refresh(); // crédits à jour dans le header
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
          message: "C'est plus long que prévu. Le résultat apparaîtra dans ta galerie.",
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

  // Un modèle impose son format et sa durée (dans la limite de l'abonnement).
  function pickTemplate(next: VideoTemplate) {
    setTemplate(next);
    setAspectRatio(next.aspectRatio);
    setDurationSeconds(Math.min(next.durationSeconds, maxVideoSeconds));
  }

  async function run(job: Job, draftToken?: string) {
    setPhase({ kind: "generating", job, id: "" });
    const started = draftToken
      ? await launchDirectorVideo({ twinId, characterId, draftToken })
      : await generate({
          twinId,
          prompt: prompt.trim(),
          ...job,
          templateId: job.kind === "video" ? template.id : undefined,
          preset: job.kind === "video" ? preset : undefined,
          pace: job.kind === "video" ? pace : undefined,
          characterId: job.kind === "video" ? characterId : undefined,
        });
    router.refresh(); // crédits à jour dans le header
    if (started.error !== undefined) {
      setPhase({ kind: "error", message: started.error });
      return;
    }
    setActive({ id: started.data.generationId, job });
  }

  const shownRatio =
    phase.kind === "generating" || phase.kind === "done" ? phase.job.aspectRatio : aspectRatio;

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <div className="flex flex-col gap-5">
        <div
          role="tablist"
          aria-label="Mode de création"
          className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1"
        >
          {(
            [
              { value: "director", label: "Director", hint: "Construis ta vidéo en discutant" },
              { value: "form", label: "Formulaire", hint: "Réglages manuels, photo ou vidéo" },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-lg px-3 py-2 text-left transition-colors ${
                mode === m.value ? "bg-neon-purple/20" : "hover:bg-white/5"
              }`}
            >
              <span className="block text-sm font-semibold">{m.label}</span>
              <span className="block text-xs text-muted">{m.hint}</span>
            </button>
          ))}
        </div>
  
        {mode === "director" ? (
          <DirectorChat
            twinId={twinId}
            credits={credits}
            busy={busy}
            onLaunch={(draft, draftToken) =>
              run(
                {
                  kind: "video",
                  aspectRatio: draft.aspectRatio,
                  durationSeconds: draft.shots.length * keptSeconds(draft.preset, draft.pace),
                },
                draftToken,
              )
            }
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) run({ kind, aspectRatio, durationSeconds });
            }}
            className="flex flex-col gap-5"
          >
            <fieldset>
              <legend className="mb-2 text-sm text-muted">Type</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "video", label: "Vidéo", hint: "Dès 1 crédit / seconde" },
                    {
                      value: "image",
                      label: "Photo",
                      hint: twinMode ? "1 crédit" : "Choisis un jumeau",
                    },
                  ] as const
                )
                  .filter((k) => twinMode || k.value === "video")
                  .map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    aria-pressed={kind === k.value}
                    className={`flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors ${
                      kind === k.value
                        ? "border-neon-purple bg-neon-purple/10"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <span className="font-semibold">{k.label}</span>
                    <span className="text-xs text-muted">{k.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
    
            {kind === "video" && (
              <fieldset>
                <legend className="mb-2 text-sm text-muted">Style de vidéo</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VIDEO_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTemplate(t)}
                      aria-pressed={template.id === t.id}
                      className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        template.id === t.id
                          ? "border-neon-purple bg-neon-purple/10"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <span className="text-sm font-semibold">{t.label}</span>
                      <span className="text-xs text-muted">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
    
            {kind === "video" && (
              <label className="flex flex-col gap-2">
                <span className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">Durée</span>
                  <span className="font-display text-lg">{formatDuration(durationSeconds)}</span>
                </span>
                <input
                  type="range"
                  min={VIDEO_STEP_SECONDS}
                  max={maxVideoSeconds}
                  step={VIDEO_STEP_SECONDS}
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  className="accent-[var(--neon-purple)]"
                />
                <span className="flex justify-between text-xs text-muted">
                  <span>{formatDuration(VIDEO_STEP_SECONDS)}</span>
                  <span>
                    {formatDuration(maxVideoSeconds)} max avec ton abonnement
                  </span>
                </span>
              </label>
            )}
    
            {kind === "video" && characters.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Personnage</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCharacterId(undefined)}
                aria-pressed={!characterId}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  characterId
                    ? "border-white/15 text-muted hover:border-white/40"
                    : "border-neon-purple bg-neon-purple/15 text-text"
                }`}
              >
                Aucun
              </button>
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCharacterId(c.id)}
                  aria-pressed={characterId === c.id}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    characterId === c.id
                      ? "border-neon-purple bg-neon-purple/15 text-text"
                      : "border-white/15 text-muted hover:border-white/40"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {kind === "video" && (
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Rythme</legend>
            <div className="grid grid-cols-2 gap-2">
              {PACES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPace(p.id)}
                  aria-pressed={pace === p.id}
                  className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    pace === p.id
                      ? "border-neon-purple bg-neon-purple/10"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-xs text-muted">{p.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {kind === "video" && presets.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Qualité</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PRESETS.filter((p) => presets.includes(p.id)).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  aria-pressed={preset === p.id}
                  className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    preset === p.id
                      ? "border-neon-purple bg-neon-purple/10"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-xs text-muted">{p.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
    
            <label className="flex flex-col gap-2">
              <span className="text-sm text-muted">
                {kind === "video"
                  ? "Raconte ta vidéo : où tu es, ce que tu fais, l'ambiance"
                  : "Où et comment veux-tu apparaître ?"}
              </span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={MAX_PROMPT_LENGTH}
                rows={5}
                placeholder={
                  kind === "video"
                    ? template.placeholder
                    : "Ex. : assis en terrasse d'un café parisien, lumière dorée du soir"
                }
                className="resize-none rounded-xl border border-white/10 bg-card px-4 py-3 outline-none focus:border-neon-purple"
              />
            </label>
    
            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-muted transition-colors hover:border-neon-cyan hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
    
            <fieldset>
              <legend className="mb-2 text-sm text-muted">Format</legend>
              <div className="grid grid-cols-3 gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setAspectRatio(f.value)}
                    aria-pressed={aspectRatio === f.value}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-sm transition-colors ${
                      aspectRatio === f.value
                        ? "border-neon-purple bg-neon-purple/10"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <span
                      className="h-8 rounded-sm border-2 border-current opacity-70"
                      style={{ aspectRatio: f.value.replace(":", " / ") }}
                    />
                    <span className="font-medium">{f.label}</span>
                    <span className="text-xs text-muted">{f.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
    
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? "Génération en cours…"
                : kind === "video"
                  ? `Créer le storyboard · ${cost} crédit${cost > 1 ? "s" : ""}`
                  : `Générer la photo · ${cost} crédit${cost > 1 ? "s" : ""}`}
            </button>
            <p className="-mt-2 text-center text-xs text-muted">
              {credits >= cost
                ? `${credits} crédit${credits > 1 ? "s" : ""} restant${credits > 1 ? "s" : ""}`
                : `Pas assez de crédits (${credits} restant${credits > 1 ? "s" : ""}).`}
            </p>
          </form>
        )}
      </div>

      <Result
        phase={phase}
        aspectRatio={shownRatio}
        canRegenerate={!busy && prompt.trim().length > 0}
        onRegenerate={() => phase.kind === "done" && run(phase.job)}
        onCancel={async () => {
          if (phase.kind !== "generating" || !phase.id) return;
          await cancelVideo(phase.id);
          setActive(null);
          setPhase({ kind: "idle" });
          router.refresh();
        }}
      />
    </div>
  );
}

function Result({
  phase,
  aspectRatio,
  canRegenerate,
  onRegenerate,
  onCancel,
}: {
  phase: Phase;
  aspectRatio: AspectRatio;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative mx-auto flex w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-card"
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
        ) : phase.kind === "generating" ? (
          <>
            {phase.view?.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={phase.view.posterUrl}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-40"
              />
            )}
            <div className="relative flex w-full flex-col items-center gap-3 px-6 text-center text-sm">
              <span className="size-10 animate-spin rounded-full border-2 border-white/15 border-t-neon-cyan" />
              <ProgressLabel phase={phase} />
            </div>
          </>
        ) : phase.kind === "error" ? (
          <p className="px-6 text-center text-sm text-neon-pink">{phase.message}</p>
        ) : (
          <p className="px-6 text-center text-sm text-muted">Ton résultat apparaîtra ici.</p>
        )}
      </div>

      {phase.kind === "generating" && phase.job.kind === "video" && phase.id && (
        <button
          type="button"
          onClick={onCancel}
          className="mx-auto rounded-lg border border-white/20 px-4 py-2 text-sm text-muted transition-colors hover:text-text"
        >
          Annuler · crédits rendus
        </button>
      )}

      {phase.kind === "done" && (
        <>
          <div className="mx-auto flex w-full max-w-sm gap-2">
            <a
              href={phase.view.downloadUrl ?? phase.view.mediaUrl}
              className="flex-1 rounded-lg bg-neon-purple py-2.5 text-center text-sm font-semibold text-white"
            >
              Télécharger
            </a>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={!canRegenerate}
              className="flex-1 rounded-lg border border-white/20 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              Regénérer
            </button>
          </div>
          <p className="text-center text-xs text-muted">Enregistrée dans ta galerie.</p>
        </>
      )}
    </div>
  );
}

function ProgressLabel({ phase }: { phase: Extract<Phase, { kind: "generating" }> }) {
  if (phase.job.kind === "image") {
    return <span className="text-muted">Ton jumeau prend la pose… (~30 s)</span>;
  }

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
      {frames ? "Images des plans" : "Animation des plans"} · {done}/{view.shotsTotal}
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-cyan transition-all"
          style={{ width: `${Math.max(progress, 4)}%` }}
        />
      </span>
      <span className="mt-2 block text-xs text-muted">
        Quelques minutes · si tu quittes la page, tu retrouveras la vidéo ici en revenant
      </span>
    </span>
  );
}
