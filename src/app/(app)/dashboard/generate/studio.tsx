"use client";

import { Coins, Download, Move, RefreshCw, Replace, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { fmt, plural } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/provider";
import {
  SWAP_ENGINES,
  SWAP_MAX_CHARACTERS,
  photosPerCharacter,
  swapCredits,
  swapMethodRate,
  swapShotCredits,
  type AspectRatio,
  type SwapEngine,
} from "@/lib/generation";
import type { SwapPreset } from "@/lib/presets";
import type { SwapHistoryItem } from "../swap-history";
import { getGeneration, type GenerationView } from "./actions";
import { clearDraft, loadDraft, saveDraft, type DraftFile } from "./draft";
import { GenjutsuBanner } from "./genjutsu-banner";
import { HistoryEmpty, HistoryList } from "./history-list";
import { cancelSwap, redoSwapShot, startSwap } from "./swap-actions";
import { SwapInput, clampedStart, uploadSwapFile, type SwapCharacter, type SwapFile } from "./swap-input";

const POLL_INTERVAL_MS = 5_000;
// Durée annoncée d'un rendu. Les séquences se rendent en même temps (quelques
// minutes, quelle que soit la longueur), mais la préparation, les contrôles et
// le montage croissent avec le clip.
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
  return (30 * 60_000 + job.durationSeconds * 20_000) * (job.vessel ? 2 : 1);
}

// vessel : base neutre, deux rendus à la suite (délais doublés).
export type Job = { aspectRatio: AspectRatio; durationSeconds: number; vessel?: boolean };

// Plan prêt avec l'URL signée de son clip, pour l'aperçu (voir GeneratePage).
export type StudioPreset = SwapPreset & { previewUrl: string };

type Phase =
  | { kind: "idle" }
  | { kind: "generating"; job: Job; id: string; view?: GenerationView }
  | { kind: "done"; job: Job; id: string; view: GenerationView }
  | { kind: "error"; message: string };

type Active = { id: string; job: Job };

// Studio : un clip filmé, l'image d'un personnage, et le personnage prend la
// place de la personne du clip (voir startSwap). Rien d'autre à régler que le
// moteur, quand il y en a plusieurs.
export function Studio({
  userId,
  credits,
  autoRecharge = false,
  engines,
  presets = [],
  history = [],
  resume,
}: {
  // null : visiteur sans compte. Il prépare tout ; au lancement, son projet
  // est gardé dans le navigateur et il passe par la connexion (voir draft.ts).
  userId: string | null;
  credits: number;
  // Recharge automatique activée : un solde trop bas ne bloque pas le
  // lancement, la carte est débitée au besoin (voir startSwap).
  autoRecharge?: boolean;
  // Moteurs disponibles, le meilleur en premier.
  engines: SwapEngine[];
  // Plans prêts (voir presets.ts), dont le clip est déjà signé.
  presets?: StudioPreset[];
  // Créations passées et en cours, de la plus récente à la plus ancienne.
  history?: SwapHistoryItem[];
  // Remplacement encore en cours, repris à l'ouverture de la page.
  resume?: Active;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const guest = !userId;
  const [supabase] = useState(createClient);
  // Projet repris après connexion : ses fichiers partent dans le stockage.
  const [restoring, setRestoring] = useState(false);

  // Clip filmé et image de chaque personnage, déjà déposés.
  const [video, setVideo] = useState<SwapFile | null>(null);
  const [characters, setCharacters] = useState<SwapCharacter[]>([
    { image: null, extras: [], target: "" },
  ]);
  // Rendu en 1080p.
  const [hd, setHd] = useState(false);
  // Haute fidélité : méthode du mannequin, deux passes, au double du prix.
  const [fidelity, setFidelity] = useState(false);
  // Remplacer (Object Swap, la scène est gardée) ou transférer le mouvement
  // (Motion Transfer, la scène est rejouée dans le lieu de la photo).
  const [mode, setMode] = useState<"replace" | "transfer">("replace");
  // Changement de décor : photo du lieu, facultative. Sans photo, seuls les
  // personnages et les cases remplies comptent, le décor du clip est gardé.
  const [decorPhoto, setDecorPhoto] = useState<SwapFile | null>(null);
  // Consignes libres à l'IA, facultatives : demandes en plus du
  // remplacement, reformulées côté serveur (voir polishSwapInstructions).
  const [instructions, setInstructions] = useState("");
  // Plan prêt choisi : son clip tient lieu de vidéo, ses personnes fixent
  // qui chaque personnage remplace.
  const [preset, setPreset] = useState<StudioPreset | null>(null);
  // Un seul moteur, une seule méthode (voir startSwap), d'un à trois
  // personnages.
  const engine: SwapEngine = "genjutsu";
  const available = engines.includes(engine);
  const several = characters.length > 1;
  const maxCharacters = SWAP_MAX_CHARACTERS;
  const availablePresets = presets.filter((p) => p.people.length <= maxCharacters);
  // Photos par personnage : 8 au plus en tout.
  const maxPhotos = photosPerCharacter(characters.length);
  const imagesReady = characters.every((c) => c.image);
  // Seul, le personnage remplace la personne principale ; à plusieurs, il
  // faut dire qui chacun remplace.
  const targetsReady = !several || characters.every((c) => c.target.trim());
  // Transfert : la photo du nouveau lieu est ce qui le distingue.
  const decorReady = mode === "replace" || Boolean(decorPhoto);
  // Durée du passage choisie ; rien = tout le clip, dans la limite du moteur.
  const [length, setLength] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);

  const resultEnd = useRef<HTMLElement>(null);
  const busy = phase.kind === "generating";
  const started = phase.kind !== "idle";
  // Ctrl/⌘ + Entrée lance le rendu.
  const onShortcut = useEffectEvent(() => launch());
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onShortcut();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  const cost = swapCredits(seconds, engine, undefined, characters.length, hd, false, fidelity);
  // Durée illisible dans le navigateur : le serveur mesure le clip et refuse
  // lui-même faute de crédits ; on ne bloque ici que sous le prix le plus bas.
  const gate = durationKnown
    ? cost
    : swapCredits(1, engine, undefined, characters.length, hd, false, fidelity);
  const ready = Boolean(video) && imagesReady && targetsReady && decorReady;
  // Connecté mais à court de crédits : le bouton mène aux offres.
  const short = !guest && ready && credits < gate && !autoRecharge;
  const canSend = available && !busy && !restoring && ready && (guest || !short);

  // Lancement, fin ou erreur : le rendu suivi revient à l'écran (sur mobile,
  // il est sous le formulaire).
  useEffect(() => {
    if (phase.kind === "idle") return;
    resultEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        return finish({ kind: "error", message: view.error ?? t.studio.failed });
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
  }, [active, resume, router, t]);

  // Projet courant gardé dans le navigateur, pour la connexion ou le détour
  // par la page Crédits.
  async function keepDraft() {
    const draftFile = (f: SwapFile): DraftFile => ({
      file: f.file!,
      path: f.path || undefined,
      seconds: f.seconds,
      start: f.start,
    });
    if (!video?.file || characters.some((c) => !c.image?.file)) return;
    await saveDraft({
      video: draftFile(video),
      characters: characters.map((c) => ({
        image: draftFile(c.image!),
        extras: c.extras.filter((f) => f.file).map(draftFile),
        target: c.target,
      })),
      decor: decorPhoto?.file ? draftFile(decorPhoto) : null,
      mode,
      hd,
      fidelity,
      instructions,
      length,
    });
  }

  // Projet préparé avant la connexion (ou avant un achat de crédits) : il
  // revient tel quel, ses fichiers envoyés au passage.
  useEffect(() => {
    if (!userId || resume) return;
    let cancelled = false;
    (async () => {
      const draft = await loadDraft();
      if (!draft || cancelled) return;
      setRestoring(true);
      try {
        const restore = async (d: DraftFile): Promise<SwapFile | null> => {
          const path = d.path ?? (await uploadSwapFile(supabase, userId, d.file));
          if (!path) return null;
          return { path, previewUrl: URL.createObjectURL(d.file), seconds: d.seconds, start: d.start, file: d.file };
        };
        const restored = await restore(draft.video);
        const chars = await Promise.all(
          draft.characters.map(async (c) => ({
            image: await restore(c.image),
            extras: (await Promise.all(c.extras.map(restore))).filter((f): f is SwapFile => Boolean(f)),
            target: c.target,
          })),
        );
        const decor = draft.decor ? await restore(draft.decor) : null;
        if (cancelled || !restored || chars.some((c) => !c.image)) return;
        setVideo(restored);
        setCharacters(chars);
        setDecorPhoto(decor);
        setMode(draft.mode);
        setHd(draft.hd);
        setFidelity(draft.fidelity);
        setInstructions(draft.instructions);
        setLength(draft.length);
        // Fichiers désormais dans le stockage : un prochain retour ne les
        // renvoie pas.
        await saveDraft({
          ...draft,
          video: { ...draft.video, path: restored.path },
          characters: draft.characters.map((c, i) => ({
            ...c,
            image: { ...c.image, path: chars[i].image!.path },
            extras: c.extras.map((e, j) => ({ ...e, path: chars[i].extras[j]?.path })),
          })),
          decor: draft.decor && decor ? { ...draft.decor, path: decor.path } : null,
        });
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, resume, supabase]);

  function choosePreset(p: StudioPreset) {
    setPreset(p);
    setVideo({ path: p.path, previewUrl: p.previewUrl, seconds: p.seconds, start: 0 });
    setLength(null);
    // Les photos déjà déposées restent, case par case.
    setCharacters((list) =>
      p.people.map((person, i) => ({
        image: list[i]?.image ?? null,
        extras: list[i]?.extras ?? [],
        target: person.target,
      })),
    );
  }

  async function launch() {
    if (!canSend || !video) return;
    // Visiteur : le projet est gardé, la connexion d'abord.
    if (guest) {
      await keepDraft();
      router.push(`/login?next=${encodeURIComponent("/dashboard/generate")}&from=studio`);
      return;
    }
    setPhase({
      kind: "generating",
      job: { aspectRatio: preset?.aspectRatio ?? "9:16", durationSeconds: seconds, vessel: fidelity },
      id: "",
    });
    const res = await startSwap({
      videoPath: video.path,
      presetId: preset?.id,
      characters: characters.map((c) => ({
        imagePath: c.image!.path,
        extraPaths: c.extras.slice(0, maxPhotos - 1).map((f) => f.path),
        target: c.target.trim() || undefined,
      })),
      start: clampedStart(video, maxSeconds),
      seconds: maxSeconds,
      hd,
      vessel: fidelity,
      decorImagePath: mode === "transfer" ? decorPhoto?.path : undefined,
      instructions: instructions.trim() || undefined,
    });
    router.refresh();
    if (res.error !== undefined) {
      setPhase({ kind: "error", message: res.error });
      return;
    }
    clearDraft();
    const job: Job = {
      aspectRatio: res.data.aspectRatio,
      durationSeconds: res.data.durationSeconds,
      vessel: fidelity,
    };
    setPhase({ kind: "generating", job, id: res.data.generationId });
    setActive({ id: res.data.generationId, job });
  }

  async function cancel() {
    if (phase.kind !== "generating" || !phase.id || !window.confirm(t.studio.cancelConfirm)) return;
    const { id, job } = phase;
    const res = await cancelSwap(id);
    if (res.error !== undefined) {
      // Déjà au montage : le suivi continue jusqu'à la vidéo.
      window.alert(res.error);
      return;
    }
    setActive(null);
    // Plan refait annulé : la vidéo d'avant reste.
    const latest = await getGeneration(id);
    router.refresh();
    setPhase(
      latest.data?.status === "completed" && latest.data.mediaUrl
        ? { kind: "done", job, id, view: latest.data }
        : { kind: "error", message: t.studio.cancelled },
    );
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

  // Prix affiché dans le bouton : le plus bas possible, connu une fois le clip
  // découpé (voir swapCredits) ; borne haute si la durée est illisible.
  const costLabel = durationKnown ? String(cost) : `≤ ${cost}`;

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        launch();
      }}
      className="composer overflow-hidden"
    >
      <div className="px-4 pt-4">
        <h1 className="mb-3 px-1 text-base font-semibold">{t.studio.createTitle}</h1>
        <div role="tablist" className="relative grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2/60 p-1">
          {/* Fond de l'onglet actif : il glisse d'un onglet à l'autre. */}
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-lg border border-line-strong thumb transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
            style={{ transform: mode === "transfer" ? "translateX(calc(100% + 0.25rem))" : undefined }}
          />
          {(["replace", "transfer"] as const).map((m) => {
            const Icon = m === "replace" ? Replace : Move;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                title={m === "replace" ? t.studio.modeReplaceHint : t.studio.modeTransferHint}
                onClick={() => setMode(m)}
                className={`relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                  mode === m ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                <Icon className={`size-4 shrink-0 transition-colors ${mode === m ? "text-accent-light" : ""}`} />
                <span className="truncate">{m === "replace" ? t.studio.modeReplace : t.studio.modeTransfer}</span>
              </button>
            );
          })}
        </div>
      </div>
      <SwapInput
        userId={userId}
        video={video}
        onVideo={(file) => {
          setVideo(file);
          // Autre clip : la durée choisie pour le précédent ne vaut plus, et
          // un plan prêt laisse la place au clip déposé, avec ses cibles.
          if (file?.path !== video?.path) {
            setLength(null);
            if (preset) {
              setPreset(null);
              setCharacters((list) => list.map((c) => ({ ...c, target: "" })));
            }
          }
        }}
        characters={characters}
        onCharacters={setCharacters}
        maxCharacters={preset ? preset.people.length : maxCharacters}
        maxPhotos={maxPhotos}
        presetPeople={preset?.people.map((p) => p.label[locale])}
        maxSeconds={preset ? preset.seconds : maxSeconds}
        compact={false}
        decorPhoto={decorPhoto}
        onDecorPhoto={setDecorPhoto}
        showDecor={mode === "transfer"}
        decorTitle={t.studio.decorRequiredTitle}
        instructions={instructions}
        onInstructions={setInstructions}
        showInstructions
      />

      {availablePresets.length > 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-faint">{t.studio.presets}</p>
          {/* Cartes verticales (les plans sont en 9:16) : la vidéo zoome
              doucement au survol, bordure d'accent une fois choisie. */}
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {availablePresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choosePreset(p)}
                aria-pressed={preset?.id === p.id}
                className={`group relative aspect-[9/16] shrink-0 overflow-hidden rounded-xl border bg-black bg-clip-padding text-left transition-[border-color,box-shadow] duration-200 ${
                  preset?.id === p.id
                    ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                    : "border-line hover:border-line-strong"
                } h-32`}
              >
                <video
                  src={p.previewUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  className="size-full scale-[1.01] object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.07]"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pt-8 pb-2 text-[11px] leading-tight text-white">
                  <span className="block truncate font-medium">{p.title[locale]}</span>
                  <span className="block text-white/70">
                    {fmt(plural(p.people.length, t.studio.presetPerson, t.studio.presetPeople), {
                      n: p.people.length,
                    })}{" "}
                    · {p.seconds} s
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Réglages : chaque choix affiche son tarif, qui suit l'autre réglage. */}
      <div className="space-y-2 px-4 pt-2 pb-4">
        <Segmented
          value={fidelity ? "fidelity" : "standard"}
          onChange={(v) => setFidelity(v === "fidelity")}
          options={[
            {
              value: "standard",
              label: t.studio.methodStandard,
              detail: `${swapMethodRate(hd).toLocaleString(locale)} cr/s`,
              title: fmt(t.studio.methodStandardHint, { rate: swapMethodRate(hd).toLocaleString(locale) }),
            },
            {
              value: "fidelity",
              label: t.studio.methodFidelity,
              detail: `${swapMethodRate(hd, true).toLocaleString(locale)} cr/s`,
              title: fmt(t.studio.methodFidelityHint, { rate: swapMethodRate(hd, true).toLocaleString(locale) }),
            },
          ]}
        />
        <Segmented
          value={hd ? "hd" : "sd"}
          onChange={(v) => setHd(v === "hd")}
          options={[
            {
              value: "sd",
              label: t.swapEngines.genjutsu.label,
              detail: `${swapMethodRate(false, fidelity).toLocaleString(locale)} cr/s`,
              title: fmt(t.swapEngines.genjutsu.hint, {
                max: SWAP_ENGINES.genjutsu.maxSeconds,
                rate: swapMethodRate(false, fidelity).toLocaleString(locale),
              }),
            },
            {
              value: "hd",
              label: t.swapEngines.genjutsuHd.label,
              detail: `${swapMethodRate(true, fidelity).toLocaleString(locale)} cr/s`,
              title: fmt(t.swapEngines.genjutsuHd.hint, {
                max: SWAP_ENGINES.genjutsu.maxSeconds,
                rate: swapMethodRate(true, fidelity).toLocaleString(locale),
              }),
            },
          ]}
        />
        {video && lengths.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {[
              ...lengths.map((l) => ({ value: l as number | null, label: `${l} s` })),
              {
                value: null,
                // Clip plus long que le maximum : c'est un passage, pas le clip entier.
                label:
                  durationKnown && video.seconds! > engineMax
                    ? `${engineMax} s`
                    : fmt(t.studio.lengthAll, { seconds: wholeSeconds }),
              },
            ].map((o) => {
              const on = o.value === null ? !length || length >= engineMax : length === o.value;
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLength(o.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                    on
                      ? "border-accent bg-accent-soft text-text"
                      : "border-line bg-surface-2/60 text-muted hover:border-line-strong hover:text-text"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line px-4 pt-3 pb-4">
        {restoring && <p className="mb-3 text-xs text-muted">{t.studio.restoring}</p>}
        {video && imagesReady && (!targetsReady || short) && (
          <p className={`mb-3 text-xs ${targetsReady ? "text-danger" : "text-warning"}`}>
            {!targetsReady ? t.studio.targetsMissing : t.studio.notEnoughCredits}
          </p>
        )}
        {durationKnown && seconds > 15 && <p className="mb-3 text-xs text-warning">{t.studio.longClipWarning}</p>}
        {/* Le prix est dans le bouton : rien d'autre à lire avant de lancer. */}
        {short ? (
          <button
            type="button"
            onClick={async () => {
              await keepDraft();
              router.push("/dashboard/credits");
            }}
            className="btn btn-hot w-full py-3.5 text-base"
          >
            <Coins />
            {t.studio.pricingCta}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            title={
              video ? fmt(t.studio.costFrom, { cost, credits: plural(cost, t.common.credit, t.common.credits) }) : undefined
            }
            className="btn btn-accent w-full py-3.5 text-base"
          >
            <WandSparkles />
            {t.studio.launch}
            {video && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-sm tabular-nums">
                <Coins className="size-3.5" />
                {costLabel}
              </span>
            )}
          </button>
        )}
      </div>
    </form>
  );

  // Le rendu suivi est affiché en tête, pas une seconde fois dans l'historique.
  const shownId = phase.kind === "generating" || phase.kind === "done" ? phase.id : null;
  const pastItems = history.filter((item) => item.id !== shownId);

  // Deux colonnes : la création à gauche (fixe au défilement), le rendu en
  // cours puis l'historique à droite. Sur mobile, l'une sous l'autre.
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      <aside className="relative z-20 animate-fade-up lg:sticky lg:top-24 lg:-mx-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:px-3 lg:pb-3">
        {composer}
      </aside>

      <section ref={resultEnd} className="min-w-0 scroll-mt-24 space-y-3">
        <GenjutsuBanner />
        {started && (
          <Result
            phase={phase}
            credits={credits}
            sourcePreview={video?.previewUrl}
            characterPreview={characters[0]?.image?.previewUrl}
            onReset={() => setPhase({ kind: "idle" })}
            onRedo={redo}
            onCancel={cancel}
          />
        )}
        {pastItems.length > 0 ? <HistoryList items={pastItems} /> : !started && <HistoryEmpty />}
      </section>
    </div>
  );
}

// Choix entre quelques options, chacune avec son tarif ; le fond de l'option
// choisie glisse de l'une à l'autre.
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; detail: string; title?: string }[];
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      className="relative grid rounded-xl border border-line bg-surface-2/60 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-lg border border-line-strong thumb transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`relative flex min-w-0 items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
              on ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            <span className="truncate text-sm font-semibold">{o.label}</span>
            <span className={`shrink-0 text-xs tabular-nums transition-colors ${on ? "text-accent-light" : "text-faint"}`}>
              {o.detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Result({
  phase,
  credits,
  sourcePreview,
  characterPreview,
  onReset,
  onRedo,
  onCancel,
}: {
  phase: Exclude<Phase, { kind: "idle" }>;
  credits: number;
  // Aperçus locaux (blob:) du clip et du personnage en cours : pendant le
  // rendu, le clip joue tamisé sous la ligne de scan et la photo du
  // personnage annonce ce qui est en train de naître. Absents à la reprise
  // d'un rendu après rechargement de la page.
  sourcePreview?: string;
  characterPreview?: string;
  onReset: () => void;
  // Refait une séquence d'un remplacement terminé.
  onRedo: (index: number) => void;
  onCancel: () => Promise<void>;
}) {
  const { t } = useI18n();
  const aspectRatio = phase.kind === "error" ? "9:16" : phase.job.aspectRatio;
  const [cancelling, setCancelling] = useState(false);
  // Pas pendant le montage : trop tard, la vidéo arrive.
  const cancellable =
    phase.kind === "generating" && Boolean(phase.id) && phase.view?.stage !== "assembling";

  return (
    <section className="panel animate-fade-up overflow-hidden">
      <div className="dot-bg flex justify-center p-6">
        {phase.kind === "error" ? (
          <p className="max-w-sm py-10 text-center text-sm text-danger">{phase.message}</p>
        ) : (
          <div
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border bg-black bg-clip-padding ${
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
                {sourcePreview && (
                  <video
                    src={sourcePreview}
                    muted
                    loop
                    autoPlay
                    playsInline
                    aria-hidden
                    className="absolute inset-0 size-full object-cover opacity-30"
                  />
                )}
                <span className="pointer-events-none absolute inset-x-0 h-16 animate-scan bg-gradient-to-b from-transparent via-accent/25 to-transparent" />
                <div className="relative flex w-full flex-col items-center gap-3 px-5 text-center text-sm">
                  {characterPreview ? (
                    // Aperçu local (blob:) : pas d'optimisation Next.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={characterPreview}
                      alt=""
                      className="size-14 rounded-xl border border-white/25 object-cover shadow-[0_12px_32px_-8px_rgb(0_0_0/0.8)]"
                    />
                  ) : (
                    <span className="size-9 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                  )}
                  <ProgressLabel phase={phase} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {phase.kind === "done" && phase.view.unreplaced > 0 && (
        <p className="border-t border-line px-4 py-3 text-sm text-amber-300">
          {fmt(t.studio.incomplete, {
            done: phase.view.shotsTotal - phase.view.unreplaced,
            total: phase.view.shotsTotal,
          })}
        </p>
      )}

      {phase.kind === "done" && phase.view.notice && (
        <p className="border-t border-line px-4 py-3 text-sm text-amber-300">{phase.view.notice}</p>
      )}

      {phase.kind === "done" && phase.view.parts.length > 1 && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-xs text-muted">
            {phase.view.engine === "genjutsu" ? t.studio.redoSequenceTitle : t.studio.redoTitle}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {phase.view.parts.map((part, i) => {
              const sequence = phase.view.engine === "genjutsu";
              const cost = swapShotCredits(
                part.seconds,
                phase.view.engine,
                phase.view.hd,
                phase.view.face,
              );
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
                  {part.flagged && ` · ${part.reason ?? t.studio.shotFlagged}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-3">
        {phase.kind === "done" && (
          <a href={phase.view.downloadUrl ?? phase.view.mediaUrl} className="btn btn-hot py-2.5 text-[0.9375rem]">
            <Download />
            {t.studio.download}
          </a>
        )}
        {cancellable && (
          <button
            type="button"
            disabled={cancelling}
            onClick={async () => {
              setCancelling(true);
              await onCancel().finally(() => setCancelling(false));
            }}
            className="btn btn-secondary"
          >
            <X />
            {t.studio.cancel}
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
  // Passé le délai annoncé depuis que le créateur regarde ce rendu, on le dit
  // plutôt que de répéter la même estimation.
  const minutes = genjutsuMinutes(phase.job.durationSeconds) * (phase.job.vessel ? 2 : 1);
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), minutes * 60_000);
    return () => clearTimeout(timer);
  }, [minutes]);
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

  // Les séquences se rendent toutes en même temps.
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
        {late
          ? t.studio.lateHint
          : view?.engine === "genjutsu"
            ? fmt(t.studio.genjutsuHint, { minutes })
            : t.studio.progressHint}
      </span>
    </span>
  );
}
