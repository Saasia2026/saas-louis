"use client";

import { CirclePlay, Clock, Coins, Download, Film, History, Layers, MonitorPlay, RefreshCw, Scissors, TriangleAlert, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { fmt, INTL_LOCALES, plural } from "@/i18n/config";
import { formatPrice, usageCharge } from "@/lib/credit-packs";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/provider";
import { VideoWall } from "@/app/video-wall";
import { VisibleVideos } from "@/app/visible-videos";
import {
  DEFAULT_SWAP_QUALITY,
  GENJUTSU_MIN_SECONDS,
  GENJUTSU_MODELS,
  SWAP_ENGINES,
  GENJUTSU_MAX_IMAGES,
  SWAP_MAX_CHARACTERS,
  SWAP_QUALITIES,
  swapCredits,
  swapMethodRate,
  swapShotCredits,
  type AspectRatio,
  type GenjutsuModel,
  type SwapEngine,
  type SwapQuality,
} from "@/lib/generation";
import type { SwapPreset } from "@/lib/presets";
import type { SwapHistoryItem } from "../swap-history";
import { getGeneration, type GenerationView } from "./actions";
import { ResultStage, StageAction } from "./result-stage";
import type { DemoClip } from "./demo-clips";
import { clearDraft, loadDraft, saveDraft, type DraftFile } from "./draft";
import { ExamplesPanel } from "./examples-panel";
import { HistoryEmpty, HistoryList } from "./history-list";
import { cancelSwap, redoSwapShot, startSwap } from "./swap-actions";
import { MODEL_ICON, ModelBadge, ModelCard, ModeTabs, Option, PanelTabs, SettingRow, Tag } from "./studio-controls";
import { SwapInput, clampedStart, readDuration, uploadSwapFile, type SwapFile } from "./swap-input";

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
  payAsYouGo = false,
  engines,
  presets = [],
  history = [],
  resume,
}: {
  // null : visiteur sans compte. Il prépare tout ; au lancement, son projet
  // est gardé dans le navigateur et il passe par la connexion (voir draft.ts).
  userId: string | null;
  credits: number;
  // Paiement à l'usage : un solde trop bas ne bloque pas le lancement, la
  // carte paie ce qui manque (voir payShortfall).
  payAsYouGo?: boolean;
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

  // Clip filmé et images (personnages, visage, profil…), déjà déposés, en
  // vrac : le prompt les cite (@image1…) et le serveur en tire qui remplace
  // qui (voir planSwapCast).
  const [video, setVideo] = useState<SwapFile | null>(null);
  const [images, setImages] = useState<SwapFile[]>([]);
  // Genjutsu (par défaut) ou Genjutsu Max, et qualité du rendu.
  const [model, setModel] = useState<GenjutsuModel>("standard");
  const [quality, setQuality] = useState<SwapQuality>(DEFAULT_SWAP_QUALITY);
  const settings = { model, quality };
  // Haute fidélité : méthode du mannequin, deux passes, au double du prix.
  const [fidelity, setFidelity] = useState(false);
  // Remplacer (Object Swap, la scène est gardée) ou transférer le mouvement
  // (Motion Transfer, la scène est rejouée dans le lieu de la photo).
  const [mode, setMode] = useState<"replace" | "transfer">("replace");
  // Changement de décor : photo du lieu, facultative. Sans photo, seuls les
  // personnages et les cases remplies comptent, le décor du clip est gardé.
  const [decorPhoto, setDecorPhoto] = useState<SwapFile | null>(null);
  // Le prompt unique : qui remplace qui et toute autre demande, reformulé
  // côté serveur (voir planSwapCast).
  const [prompt, setPrompt] = useState("");
  // Plan prêt choisi : son clip tient lieu de vidéo, ses personnes fixent
  // qui chaque personnage remplace.
  const [preset, setPreset] = useState<StudioPreset | null>(null);
  // Un seul moteur, une seule méthode (voir startSwap), d'un à trois
  // personnages.
  const engine: SwapEngine = "genjutsu";
  const available = engines.includes(engine);
  const availablePresets = presets.filter((p) => p.people.length <= SWAP_MAX_CHARACTERS);
  // 8 images au plus (limite de Higgsfield) ; plan prêt : une par personne.
  const maxImages = preset ? preset.people.length : GENJUTSU_MAX_IMAGES;
  // Sans image, seule la photo du lieu peut suffire (Motion transfer).
  const imagesReady = preset
    ? images.length >= preset.people.length
    : images.length > 0 || (mode === "transfer" && Boolean(decorPhoto));
  // Personnages facturés (une fiche chacun) : connus d'avance pour un plan
  // prêt ; sinon au plus un par image, trois au plus. Le serveur débite la
  // distribution retenue, jamais plus que ce prix affiché.
  const castCount = preset ? preset.people.length : Math.min(SWAP_MAX_CHARACTERS, Math.max(1, images.length));
  const castKnown = Boolean(preset) || images.length <= 1;
  // Transfert : la photo du nouveau lieu est ce qui le distingue.
  const decorReady = mode === "replace" || Boolean(decorPhoto);
  // Durée du passage choisie ; rien = tout le clip, dans la limite du moteur.
  const [length, setLength] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);
  // Onglet de droite : l'historique s'il y a déjà des vidéos, sinon les exemples.
  const [tab, setTab] = useState<"history" | "examples" | "how">(history.length ? "history" : "examples");

  const resultEnd = useRef<HTMLElement>(null);
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
  const cost = swapCredits(seconds, engine, undefined, castCount, settings, false, fidelity);
  // Durée illisible dans le navigateur : le serveur mesure le clip et refuse
  // lui-même faute de crédits ; on ne bloque ici que sous le prix le plus bas.
  const gate = durationKnown
    ? cost
    : swapCredits(1, engine, undefined, castCount, settings, false, fidelity);
  const ready = Boolean(video) && imagesReady && decorReady;
  // Ce qu'il manque pour lancer, affiché au-dessus du bouton.
  const missing = !video
    ? t.studio.missingVideo
    : !imagesReady
      ? t.studio.missingCharacter
      : !decorReady
        ? t.studio.missingDecor
        : null;
  // Connecté mais à court de crédits : « Générer » mène aux packs.
  const short = !guest && ready && credits < gate && !payAsYouGo;
  // Paiement à l'usage : ce que la carte paiera, annoncé avant de lancer.
  const byCard = !guest && ready && credits < gate && payAsYouGo;
  const canSend = available && !busy && !restoring && ready;

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
    if (!video?.file || images.some((f) => !f.file)) return;
    await saveDraft({
      video: draftFile(video),
      images: images.map(draftFile),
      decor: decorPhoto?.file ? draftFile(decorPhoto) : null,
      mode,
      model,
      quality,
      fidelity,
      instructions: prompt,
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
        // Anciens brouillons : images rangées personnage par personnage.
        const draftImages =
          draft.images ?? draft.characters?.flatMap((c) => [c.image, ...c.extras]) ?? [];
        const imgs = await Promise.all(draftImages.slice(0, GENJUTSU_MAX_IMAGES).map(restore));
        const decor = draft.decor ? await restore(draft.decor) : null;
        if (cancelled || !restored || imgs.some((f) => !f)) return;
        const restoredImages = imgs as SwapFile[];
        setVideo(restored);
        setImages(restoredImages);
        setDecorPhoto(decor);
        setMode(draft.mode);
        setModel(draft.model ?? "max");
        setQuality(draft.quality ?? (draft.hd ? "1080p" : DEFAULT_SWAP_QUALITY));
        setFidelity(draft.fidelity);
        setPrompt(draft.instructions);
        setLength(draft.length);
        // Fichiers désormais dans le stockage : un prochain retour ne les
        // renvoie pas.
        await saveDraft({
          ...draft,
          video: { ...draft.video, path: restored.path },
          characters: undefined,
          images: draftImages
            .slice(0, GENJUTSU_MAX_IMAGES)
            .map((d, i) => ({ ...d, path: restoredImages[i].path })),
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

  useEffect(() => {
    if (!video) clearDraft();
  }, [video]);

  function choosePreset(p: StudioPreset) {
    setPreset(p);
    setVideo({ path: p.path, previewUrl: p.previewUrl, seconds: p.seconds, start: 0 });
    setLength(null);
    // Les images déjà déposées restent, une par personne du plan.
    setImages((list) => list.slice(0, p.people.length));
  }

  // Reprendre une démo : son clip entre dans le studio comme s'il venait
  // d'être déposé, il ne reste qu'à ajouter son personnage.
  async function recreateDemo(clip: DemoClip) {
    const res = await fetch(`${clip.base}.mp4`).catch(() => null);
    if (!res?.ok) return false;
    const file = new File([await res.blob()], `${clip.base.split("/").pop()}.mp4`, { type: "video/mp4" });
    const previewUrl = URL.createObjectURL(file);
    const [seconds, path] = await Promise.all([
      readDuration(previewUrl),
      userId ? uploadSwapFile(supabase, userId, file) : "",
    ]);
    if (path === null) {
      URL.revokeObjectURL(previewUrl);
      return false;
    }
    if (video) URL.revokeObjectURL(video.previewUrl);
    setVideo({ path, previewUrl, seconds, start: 0, file });
    setPreset(null);
    setLength(null);
    setMode("replace");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  // À court de crédits : le projet est gardé, direction les packs, avec ce
  // qui manque.
  async function goPay(missing: number) {
    await keepDraft();
    router.push(`/dashboard/credits?need=${Math.max(1, missing)}#packs`);
  }

  async function launch() {
    if (!canSend || !video) return;
    // Visiteur : le projet est gardé, la connexion d'abord.
    if (guest) {
      await keepDraft();
      router.push(`/login?next=${encodeURIComponent("/dashboard/generate")}&from=studio`);
      return;
    }
    if (short) {
      await goPay(gate - credits);
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
      // Plan prêt : image N pour sa personne N. Sinon les images en vrac.
      ...(preset
        ? { characters: images.slice(0, preset.people.length).map((f) => ({ imagePath: f.path })) }
        : { characters: [], photos: images.map((f) => f.path) }),
      start: clampedStart(video, maxSeconds),
      seconds: maxSeconds,
      model,
      quality,
      vessel: fidelity,
      decorImagePath: mode === "transfer" ? decorPhoto?.path : undefined,
      instructions: prompt.trim() || undefined,
    });
    router.refresh();
    if (res.error !== undefined) {
      // Le serveur mesure le clip : s'il coûte plus que le solde, même chemin.
      if (res.needCredits !== undefined) {
        setPhase({ kind: "idle" });
        await goPay(res.needCredits - credits);
        return;
      }
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
  const costLabel = durationKnown && castKnown ? String(cost) : `≤ ${cost}`;

  const modelName = (m: GenjutsuModel) => (m === "max" ? t.studio.modelMax : t.studio.modelStandard);
  const modelTagline = (m: GenjutsuModel) => (m === "max" ? t.studio.modelMaxTagline : t.studio.modelStandardTagline);
  const rate = (r: number) => fmt(t.studio.perSecond, { rate: r.toLocaleString(locale) });
  const modelOptions = (close: () => void) =>
    GENJUTSU_MODELS.map((m) => (
      <Option
        key={m}
        selected={model === m}
        onSelect={() => {
          setModel(m);
          close();
        }}
        icon={MODEL_ICON[m]}
        title={modelName(m)}
        badge={m === "standard" ? t.studio.modelNew : undefined}
        detail={
          <>
            <Tag>{fmt(t.studio.upTo, { res: "1080p" })}</Tag>
            <Tag>
              {fmt(t.studio.clipRange, {
                min: Math.ceil(GENJUTSU_MIN_SECONDS),
                max: SWAP_ENGINES.genjutsu.maxSeconds,
              })}
            </Tag>
            <span className="basis-full">{modelTagline(m)}</span>
          </>
        }
        aside={rate(swapMethodRate({ model: m, quality }, fidelity))}
      />
    ));

  // Durées proposées : quelques passages courts, ou tout le clip.
  const lengthOptions = video
    ? [
        ...lengths.map((l) => ({ value: l as number | null, label: `${l} s` })),
        {
          value: null,
          // Clip plus long que le maximum : c'est un passage, pas le clip entier.
          label:
            durationKnown && video.seconds! > engineMax
              ? `${engineMax} s`
              : fmt(t.studio.lengthAll, { seconds: wholeSeconds }),
        },
      ].map((o) => ({ ...o, on: o.value === null ? !length || length >= engineMax : length === o.value }))
    : [];

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        launch();
      }}
      className="composer overflow-hidden"
    >
      <div className="space-y-3 px-4 pt-4">
        <h1 className="sr-only">{t.studio.createTitle}</h1>
        <ModelCard name={modelName(model)} tagline={modelTagline(model)} changeLabel={t.studio.changeModel}>
          {modelOptions}
        </ModelCard>
        <ModeTabs
          value={mode}
          onChange={setMode}
          labels={{
            replace: { title: t.studio.modeReplace, hint: t.studio.modeReplaceHint },
            transfer: { title: t.studio.modeTransfer, hint: t.studio.modeTransferHint },
          }}
        />
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
            if (preset) setPreset(null);
          }
        }}
        images={images}
        onImages={setImages}
        maxImages={maxImages}
        presetPeople={preset?.people.map((p) => p.label[locale])}
        maxSeconds={preset ? preset.seconds : maxSeconds}
        decorPhoto={decorPhoto}
        onDecorPhoto={setDecorPhoto}
        showDecor={mode === "transfer"}
        prompt={prompt}
        onPrompt={setPrompt}
      />

      {availablePresets.length > 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-faint">{t.studio.presets}</p>
          {/* Cartes verticales (les plans sont en 9:16) : la vidéo zoome
              doucement au survol, bordure d'accent une fois choisie. */}
          <VisibleVideos className="mt-2 flex gap-2 overflow-x-auto pb-1">
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
                  loop
                  preload="metadata"
                  playsInline
                  webkit-playsinline=""
                  disablePictureInPicture
                  disableRemotePlayback
                  className="pointer-events-none size-full scale-[1.01] object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.07]"
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
          </VisibleVideos>
        </div>
      )}

      {/* Réglages : une ligne par choix, son menu s'ouvre à côté du panneau ;
          chaque option affiche son tarif, qui suit les autres réglages. */}
      <div className="space-y-2 px-4 pt-2 pb-4">
        <SettingRow
          label={t.studio.modelLabel}
          value={
            <>
              {modelName(model)}
              {model === "standard" && <ModelBadge>{t.studio.modelNew}</ModelBadge>}
            </>
          }
        >
          {modelOptions}
        </SettingRow>
        <SettingRow label={t.studio.qualityLabel} value={quality}>
          {(close) =>
            SWAP_QUALITIES.map((q) => (
              <Option
                key={q}
                selected={quality === q}
                onSelect={() => {
                  setQuality(q);
                  close();
                }}
                icon={MonitorPlay}
                title={q}
                aside={rate(swapMethodRate({ model, quality: q }, fidelity))}
              />
            ))
          }
        </SettingRow>
        <SettingRow label={t.studio.methodLabel} value={fidelity ? t.studio.methodFidelity : t.studio.methodStandard}>
          {(close) =>
            ([false, true] as const).map((f) => (
              <Option
                key={String(f)}
                selected={fidelity === f}
                onSelect={() => {
                  setFidelity(f);
                  close();
                }}
                icon={f ? Layers : WandSparkles}
                title={f ? t.studio.methodFidelity : t.studio.methodStandard}
                detail={fmt(f ? t.studio.methodFidelityHint : t.studio.methodStandardHint, {
                  rate: swapMethodRate(settings, f).toLocaleString(locale),
                })}
                aside={rate(swapMethodRate(settings, f))}
              />
            ))
          }
        </SettingRow>
        {video && lengths.length > 0 && (
          <SettingRow label={t.studio.length} value={lengthOptions.find((o) => o.on)?.label}>
            {(close) =>
              lengthOptions.map((o) => (
                <Option
                  key={o.label}
                  selected={o.on}
                  onSelect={() => {
                    setLength(o.value);
                    close();
                  }}
                  icon={o.value === null ? Scissors : Clock}
                  title={o.label}
                />
              ))
            }
          </SettingRow>
        )}
      </div>

      <div className="border-t border-line px-4 pt-3 pb-4">
        {restoring && <p className="mb-3 text-xs text-muted">{t.studio.restoring}</p>}
        {video && imagesReady && short && (
          <p className="mb-3 text-xs text-danger">{fmt(t.studio.notEnoughCredits, { n: gate - credits })}</p>
        )}
        {byCard && (
          <p className="mb-3 text-xs text-muted">
            {fmt(t.studio.payByCard, {
              n: gate - credits,
              price: formatPrice(usageCharge(gate - credits).amount, INTL_LOCALES[locale]),
            })}
          </p>
        )}
        {durationKnown && seconds > 15 && <p className="mb-3 text-xs text-warning">{t.studio.longClipWarning}</p>}
        {missing && !restoring && <p className="mb-3 text-xs text-muted">{missing}</p>}
        {/* Le prix est dans le bouton : rien d'autre à lire avant de lancer. */}
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
      </div>
    </form>
  );

  // Le rendu suivi est affiché en tête, pas une seconde fois dans l'historique.
  const shownId = phase.kind === "generating" || phase.kind === "done" ? phase.id : null;
  const pastItems = history.filter((item) => item.id !== shownId);

  // Deux colonnes : la création à gauche (fixe au défilement), le rendu en
  // cours puis les onglets à droite (historique, exemples, démo). Sur
  // mobile, l'une sous l'autre.
  return (
    <>
    <VideoWall />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      <aside className="relative z-20 animate-fade-up lg:sticky lg:top-24 lg:-mx-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:px-3 lg:pb-3">
        {composer}
      </aside>

      <section ref={resultEnd} className="min-w-0 scroll-mt-24 space-y-3">
        {started && (
          <Result
            phase={phase}
            credits={credits}
            sourcePreview={video?.previewUrl}
            characterPreview={images[0]?.previewUrl}
            onReset={() => setPhase({ kind: "idle" })}
            onRedo={redo}
            onCancel={cancel}
          />
        )}
        <div className="panel animate-fade-up p-3 sm:p-4">
          <PanelTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "history", label: t.studio.tabHistory, icon: History },
              { value: "examples", label: t.studio.tabExamples, icon: Film },
              { value: "how", label: t.studio.tabHow, icon: CirclePlay },
            ]}
          />
          <div className="mt-4">
            {tab === "history" &&
              (pastItems.length > 0 ? (
                <HistoryList items={pastItems} />
              ) : (
                <p className="py-16 text-center text-sm text-muted">{t.studio.historyNone}</p>
              ))}
            {tab === "examples" && <ExamplesPanel onRecreate={recreateDemo} />}
            {tab === "how" && <HistoryEmpty />}
          </div>
        </div>
      </section>
    </div>
    </>
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

  const actions = (
    <>
      {phase.kind === "done" && (
        <StageAction icon={Download} label={t.studio.download} href={phase.view.downloadUrl ?? phase.view.mediaUrl} />
      )}
      {cancellable && (
        <StageAction
          icon={X}
          label={t.studio.cancel}
          disabled={cancelling}
          onClick={async () => {
            setCancelling(true);
            await onCancel().finally(() => setCancelling(false));
          }}
        />
      )}
      {phase.kind !== "generating" && <StageAction icon={RefreshCw} label={t.studio.newVideo} onClick={onReset} />}
    </>
  );

  return (
    <section className="panel animate-fade-up overflow-hidden">
      {phase.kind === "error" ? (
        <div className="flex flex-col items-center gap-4 p-6">
          <div
            role="alert"
            className="my-4 flex max-w-md items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{phase.message}</p>
          </div>
          <button type="button" onClick={onReset} className="btn btn-secondary">
            <RefreshCw />
            {t.studio.newVideo}
          </button>
        </div>
      ) : (
        <ResultStage
          // Nouvelle scène par rendu : le fondu rejoue pour chaque vidéo.
          key={phase.id}
          aspectRatio={aspectRatio}
          mediaUrl={phase.kind === "done" ? phase.view.mediaUrl : undefined}
          backdrop={sourcePreview}
          actions={actions}
          overlay={
            phase.kind === "generating" && (
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
            )
          }
        />
      )}

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
                phase.view.settings,
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
