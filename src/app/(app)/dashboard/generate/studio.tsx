"use client";

import { CalendarClock, Check, CirclePlay, Coins, Download, Film, History, Loader2, MonitorPlay, RefreshCw, Sparkles, TriangleAlert, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { fmt, INTL_LOCALES, plural } from "@/i18n/config";
import { formatPrice, usageCharge } from "@/lib/credit-packs";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/provider";
import { VisibleVideos } from "@/app/visible-videos";
import {
  DEFAULT_SWAP_QUALITY,
  GENJUTSU_MIN_SECONDS,
  GENJUTSU_MODELS,
  SWAP_ENGINES,
  DEFAULT_GENJUTSU_MODEL,
  GENJUTSU_LIGHT_MAX_SECONDS,
  GENJUTSU_MAX_IMAGES,
  RESTYLE_MAX_IMAGES,
  STUDIO_QUALITIES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_CHARACTERS,
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
import { ResultStage } from "./result-stage";
import { clearDraft, loadDraft, saveDraft, type DraftFile } from "./draft";
import { ExamplesPanel } from "./examples-panel";
import { HistoryEmpty, HistoryList } from "./history-list";
import { cancelSwap, redoSwapShot, startSwap } from "./swap-actions";
import {
  MODEL_ICON,
  ModelBadge,
  ModelCard,
  ModeTabs,
  Option,
  PanelTabs,
  SettingRow,
  Tag,
  type StudioMode,
} from "./studio-controls";
import { StylePicker, type StudioStyle } from "./style-picker";
import { SwapInput, keptSeconds, readDuration, uploadSwapFile, type SwapFile } from "./swap-input";
import { askBotsToAnalyze } from "../../bots/bots-state";
import Link from "next/link";
import R from "./result.module.css";
import L from "./studio-layout.module.css";

const POLL_INTERVAL_MS = 5_000;
// Durée annoncée d'un rendu. Les séquences se rendent en même temps (quelques
// minutes, quelle que soit la longueur), mais la préparation, les contrôles et
// le montage croissent avec le clip.
function genjutsuMinutes(seconds: number) {
  return seconds <= 15 ? 5 : seconds <= 30 ? 6 : seconds <= 60 ? 8 : 10;
}

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
  styles = [],
  history = [],
  resume,
  reuseId,
  startImage,
}: {
  // Styles du mode Restyle (voir listRestyleStyles) ; vide : le mode n'est
  // pas proposé.
  styles?: StudioStyle[];
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
  // Rendu à reprendre dans le studio (« Réutiliser » depuis Mes vidéos).
  reuseId?: string;
  // Influenceur IA choisi : il devient l'image du personnage, même si un
  // brouillon revient (son clip est gardé).
  startImage?: { path: string; previewUrl: string };
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
  const [chosenModel, setModel] = useState<GenjutsuModel>(DEFAULT_GENJUTSU_MODEL);
  const [quality, setQuality] = useState<SwapQuality>(DEFAULT_SWAP_QUALITY);
  // Haute fidélité : méthode du mannequin, deux passes, au double du prix.
  const [chosenFidelity, setFidelity] = useState(false);
  // Remplacer (Object Swap, le clip est retouché en place) ou transférer le
  // mouvement (Motion Transfer, toute la scène est refaite : le personnage
  // prend tout le corps, animal compris).
  const [mode, setMode] = useState<StudioMode>("replace");
  // Style optionnel (Restyle) : disponible dans tous les modes. Quand un
  // style est choisi, le rendu passe en mode restyle côté API (Shinka Max,
  // une passe).
  const [style, setStyle] = useState<StudioStyle | null>(null);
  const restyle = Boolean(style);
  const model: GenjutsuModel = restyle ? "max" : chosenModel;
  const fidelity = chosenFidelity && !restyle;
  const settings = { model, quality, restyle };
  // Transfert : photo d'un nouveau lieu, facultative. Sans elle, la scène est
  // refaite d'après le décor du clip.
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
  // Restyle : 5 images de personnage au plus, facultatives.
  const maxImages = preset ? preset.people.length : restyle ? RESTYLE_MAX_IMAGES : GENJUTSU_MAX_IMAGES;
  // Sans image, seule la photo du lieu peut suffire (Motion transfer) ; en
  // Restyle (style choisi), les images sont facultatives.
  const imagesReady = restyle
    ? true
    : preset
      ? images.length >= preset.people.length
      : images.length > 0 || (mode === "transfer" && Boolean(decorPhoto));
  // Personnages facturés (une fiche chacun) : connus d'avance pour un plan
  // prêt ; sinon au plus un par image, trois au plus. Le serveur débite la
  // distribution retenue, jamais plus que ce prix affiché.
  const castCount = preset ? preset.people.length : Math.min(SWAP_MAX_CHARACTERS, Math.max(1, images.length));
  const castKnown = Boolean(preset) || images.length <= 1;

  const [phase, setPhase] = useState<Phase>(
    resume ? { kind: "generating", job: resume.job, id: resume.id } : { kind: "idle" },
  );
  const [active, setActive] = useState<Active | null>(resume ?? null);
  // Onglet de droite : l'historique s'il y a déjà des vidéos, sinon les exemples.
  const [tab, setTab] = useState<"history" | "examples" | "how">(history.length ? "history" : "examples");

  const resultEnd = useRef<HTMLElement>(null);
  // Appel API en cours (quelques secondes) : empêche le double-clic.
  const [launching, setLaunching] = useState(false);
  // Notification éphémère après un lancement réussi.
  const [launched, setLaunched] = useState(false);
  const started = phase.kind !== "idle";
  // Genjutsu lit au plus 30 s (15 s pour Shinka) du clip, ou du passage
  // choisi dans la fenêtre de découpe. Même calcul que le serveur (voir
  // startSwap).
  const maxSeconds = model === "standard" ? GENJUTSU_LIGHT_MAX_SECONDS : SWAP_ENGINES[engine].maxSeconds;
  const durationKnown = Number.isFinite(video?.seconds);
  const clipSeconds = durationKnown ? keptSeconds(video!, maxSeconds) : NaN;
  const seconds = durationKnown
    ? Math.max(1, Math.round(clipSeconds))
    : maxSeconds;
  const cost = swapCredits(seconds, engine, undefined, castCount, settings, false, fidelity);
  // Durée illisible dans le navigateur : le serveur mesure le clip et refuse
  // lui-même faute de crédits ; on ne bloque ici que sous le prix le plus bas.
  const gate = durationKnown
    ? cost
    : swapCredits(1, engine, undefined, castCount, settings, false, fidelity);
  const ready = Boolean(video) && imagesReady;
  // Ce qu'il manque pour lancer, affiché au-dessus du bouton.
  const missing = !video
    ? t.studio.missingVideo
    : !imagesReady
      ? t.studio.missingCharacter
      : null;

  function changeMode(next: StudioMode) {
    setMode(next);
  }
  // Connecté mais à court de crédits : « Générer » mène aux packs.
  const short = !guest && ready && credits < gate && !payAsYouGo;
  // Paiement à l'usage : ce que la carte paiera, annoncé avant de lancer.
  const byCard = !guest && ready && credits < gate && payAsYouGo;
  const canSend = available && !launching && !restoring && ready;

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
      file: f.file,
      path: f.path || undefined,
      seconds: f.seconds,
      start: f.start,
      length: f.length,
    });
    // Chaque fichier est gardé lui-même, ou par son chemin s'il vient de la
    // bibliothèque.
    const kept = (f: SwapFile) => Boolean(f.file || f.path);
    if (!video || !kept(video) || !images.every(kept)) return;
    await saveDraft({
      video: draftFile(video),
      images: images.map(draftFile),
      decor: decorPhoto && kept(decorPhoto) ? draftFile(decorPhoto) : null,
      mode,
      styleId: style?.id,
      model: chosenModel,
      quality,
      fidelity: chosenFidelity,
      instructions: prompt,
      length: null,
    });
  }

  // Mode d'un brouillon. Restyle : seulement si le mode est proposé ; le style
  // revient s'il est encore au catalogue.
  const restoreMode = useEffectEvent((draftMode: StudioMode, styleId?: string) => {
    setMode(draftMode === "restyle" ? "replace" : draftMode);
    setStyle(styles.find((s) => s.id === styleId) ?? null);
  });

  // Projet préparé avant la connexion (ou avant un achat de crédits) : il
  // revient tel quel, ses fichiers envoyés au passage.
  const startPath = startImage?.path;
  const startUrl = startImage?.previewUrl;
  useEffect(() => {
    if (!userId || resume) return;
    let cancelled = false;
    const start = startPath && startUrl ? { path: startPath, previewUrl: startUrl } : null;
    (async () => {
      const draft = await loadDraft();
      if (cancelled) return;
      if (!draft) {
        if (start) setImages([start]);
        return;
      }
      setRestoring(true);
      try {
        const restore = async (d: DraftFile): Promise<SwapFile | null> => {
          const file = d.file;
          const path = d.path ?? (file ? await uploadSwapFile(supabase, userId, file) : null);
          if (!path) return null;
          // Fichier de la bibliothèque : son aperçu est une URL signée.
          const previewUrl = file
            ? URL.createObjectURL(file)
            : (await supabase.storage.from(SWAP_INPUTS_BUCKET).createSignedUrl(path, 60 * 60)).data?.signedUrl;
          if (!previewUrl) return null;
          return { path, previewUrl, seconds: d.seconds, start: d.start, length: d.length, file };
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
        setImages(start ? [start] : restoredImages);
        setDecorPhoto(decor);
        restoreMode(draft.mode, draft.styleId);
        setModel(draft.model ?? DEFAULT_GENJUTSU_MODEL);
        // Un brouillon en 480p (qualité retirée du studio) repart en 720p.
        setQuality(
          draft.quality && STUDIO_QUALITIES.includes(draft.quality)
            ? draft.quality
            : draft.hd
              ? "1080p"
              : DEFAULT_SWAP_QUALITY,
        );
        setFidelity(draft.fidelity);
        setPrompt(draft.instructions);
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
  }, [userId, resume, supabase, startPath, startUrl]);

  useEffect(() => {
    if (!video) clearDraft();
  }, [video]);

  function choosePreset(p: StudioPreset) {
    setPreset(p);
    setVideo({ path: p.path, previewUrl: p.previewUrl, seconds: p.seconds, start: 0 });
    // Les images déjà déposées restent, une par personne du plan.
    setImages((list) => list.slice(0, p.people.length));
  }

  // Reprendre une démo : son clip entre dans le studio comme s'il venait
  // d'être déposé, il ne reste qu'à ajouter son personnage.
  async function recreateDemo({ url, name }: { url: string; name: string }) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) return false;
    const file = new File([await res.blob()], `${name}.mp4`, { type: "video/mp4" });
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
    setMode("replace");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  // Reprendre un rendu : son clip (avec le passage gardé), ses images, son
  // prompt et ses réglages reviennent dans le studio, prêts à relancer.
  async function reuse(item: SwapHistoryItem) {
    const source = item.source;
    if (source) {
      const seconds = await readDuration(source.url);
      setVideo((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return { path: source.path, previewUrl: source.url, seconds, start: source.start, length: source.seconds };
      });
      setPreset(null);
    }
    setImages(item.refs.map((r) => ({ path: r.path, previewUrl: r.url })));
    setDecorPhoto(item.decor ? { path: item.decor.path, previewUrl: item.decor.url } : null);
    // Rendu Restyle : son style revient s'il est encore au catalogue.
    const itemStyle = item.restyle ? styles.find((s) => s.id === item.restyle!.id) : undefined;
    setMode(item.transfer ? "transfer" : "replace");
    setStyle(itemStyle ?? null);
    setModel(item.settings.model);
    setQuality(STUDIO_QUALITIES.includes(item.settings.quality) ? item.settings.quality : DEFAULT_SWAP_QUALITY);
    setFidelity(item.fidelity);
    setPrompt(item.prompt);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Lien vers une démo du fil (?reel=…) : l'onglet Exemples l'ouvre.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("reel")) return;
    const timer = setTimeout(() => setTab("examples"), 0);
    return () => clearTimeout(timer);
  }, []);

  // « Réutiliser » depuis Mes vidéos : le rendu demandé est repris une fois.
  const reuseOnOpen = useEffectEvent(async () => {
    const item = history.find((h) => h.id === reuseId);
    if (!item) return;
    await reuse(item);
    router.replace("/dashboard/generate", { scroll: false });
  });
  useEffect(() => {
    if (!reuseId) return;
    const timer = setTimeout(reuseOnOpen, 0);
    return () => clearTimeout(timer);
  }, [reuseId]);

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
    setLaunching(true);
    try {
      const res = await startSwap({
        videoPath: video.path,
        presetId: preset?.id,
        ...(preset
          ? { characters: images.slice(0, preset.people.length).map((f) => ({ imagePath: f.path })) }
          : { characters: [], photos: images.map((f) => f.path) }),
        model,
        quality,
        vessel: fidelity,
        transfer: mode === "transfer",
        decorImagePath: mode === "transfer" ? decorPhoto?.path : undefined,
        ...(restyle && style && { restyle: { presetId: style.id } }),
        instructions: prompt.trim() || undefined,
        // Passage choisi dans la fenêtre de découpe ; sans lui, le clip entier.
        ...(!preset && video.length !== undefined && { start: video.start ?? 0, seconds: video.length }),
      });
      if (res.error !== undefined) {
        if (res.needCredits !== undefined) {
          await goPay(res.needCredits - credits);
          return;
        }
        setPhase({ kind: "error", message: res.error });
        return;
      }
      clearDraft();
      router.refresh();
      setTab("history");
      setLaunched(true);
      setTimeout(() => setLaunched(false), 4000);
    } finally {
      setLaunching(false);
    }
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
  // Restyle n'existe qu'avec Shinka Max.
  const modelOptions = (close: () => void) =>
    GENJUTSU_MODELS.filter((m) => !restyle || m === "max").map((m) => (
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
        aside={rate(swapMethodRate({ model: m, quality, restyle }, fidelity))}
      />
    ));

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        launch();
      }}
      className={`composer overflow-hidden ${L.composer}`}
    >
      <div className={L.tabs}>
        <h1 className="sr-only">{t.studio.createTitle}</h1>
        <ModeTabs
          value={mode}
          onChange={changeMode}
          labels={{
            replace: { title: t.studio.modeReplace, hint: t.studio.modeReplaceHint },
            transfer: {
              title: t.studio.modeTransfer,
              hint: t.studio.modeTransferHint,
              short: t.studio.modeTransferShort,
            },
            restyle: { title: t.studio.modeRestyle, hint: t.studio.modeRestyleHint },
          }}
        />
      </div>
      <div className={L.body}>
      <div className="min-w-0">
      <SwapInput
        userId={userId}
        video={video}
        onVideo={(file) => {
          setVideo(file);
          // Autre clip : un plan prêt laisse la place au clip déposé.
          if (file?.path !== video?.path && preset) setPreset(null);
        }}
        images={images}
        onImages={setImages}
        maxImages={maxImages}
        presetPeople={preset?.people.map((p) => p.label[locale])}
        canTrim={!preset}
        maxSeconds={preset ? preset.seconds : maxSeconds}
        decorPhoto={decorPhoto}
        onDecorPhoto={setDecorPhoto}
        showDecor={mode === "transfer"}
        prompt={prompt}
        onPrompt={setPrompt}
      >
        {styles.length > 0 && (
          <StylePicker styles={styles} value={style} onChange={setStyle} onClear={() => setStyle(null)} />
        )}
      </SwapInput>

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
                className={`group relative aspect-[9/16] shrink-0 overflow-hidden rounded-2xl border bg-black bg-clip-padding text-left transition-[border-color,box-shadow] duration-200 ${
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
      </div>
      <div className={L.engine}>
        <ModelCard name={modelName(model)} tagline={modelTagline(model)} changeLabel={t.studio.changeModel}>
          {modelOptions}
        </ModelCard>
      </div>
      </div>

      {/* Messages avant le lancement, au-dessus de la barre du bas. */}
      <div className={`${L.notes} space-y-1.5 pt-3`}>
        {restoring && <p className="text-xs text-muted">{t.studio.restoring}</p>}
        {video && imagesReady && short && (
          <p className="text-xs text-danger">{fmt(t.studio.notEnoughCredits, { n: gate - credits })}</p>
        )}
        {byCard && (
          <p className="text-xs text-muted">
            {fmt(t.studio.payByCard, {
              n: gate - credits,
              price: formatPrice(usageCharge(gate - credits).amount, INTL_LOCALES[locale]),
            })}
          </p>
        )}
        {durationKnown && seconds > 15 && <p className="text-xs text-warning">{t.studio.longClipWarning}</p>}
        {missing && !restoring && <p className="text-xs text-muted">{missing}</p>}
      </div>

      {/* Barre du bas : réglages (leur menu affiche les tarifs) et le
          bouton, prix compris. */}
      <div className={L.foot}>
        <div className={L.setting}>
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
        </div>
        <div className={L.setting}>
        <SettingRow label={t.studio.qualityLabel} value={quality}>
          {(close) =>
            STUDIO_QUALITIES.map((q) => (
              <Option
                key={q}
                selected={quality === q}
                onSelect={() => {
                  setQuality(q);
                  close();
                }}
                icon={MonitorPlay}
                title={q}
                aside={rate(swapMethodRate({ model, quality: q, restyle }, fidelity))}
              />
            ))
          }
        </SettingRow>
        </div>
        <div className={L.launch}>
        {/* Le prix est dans le bouton : rien d'autre à lire avant de lancer. */}
        <button
          type="submit"
          disabled={!canSend}
          title={
            video ? fmt(t.studio.costFrom, { cost, credits: plural(cost, t.common.credit, t.common.credits) }) : undefined
          }
          className="btn btn-accent"
        >
          {launching ? <Loader2 className="animate-spin" /> : <WandSparkles />}
          {t.studio.launch}
          {video && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-sm tabular-nums">
              <Coins className="size-3.5" />
              {costLabel}
            </span>
          )}
        </button>
        </div>
      </div>
    </form>
  );

  // Le rendu suivi est affiché en tête, pas une seconde fois dans l'historique.
  const shownId = phase.kind === "generating" || phase.kind === "done" ? phase.id : null;
  const pastItems = history.filter((item) => item.id !== shownId);

  // Le générateur, large et centré ; dessous, sur toute la largeur, le rendu
  // en cours puis les onglets (historique, exemples, démo).
  return (
    <>
    {launched && (
      <div className="fixed inset-x-0 top-4 z-50 flex justify-center animate-fade-up pointer-events-none">
        <div className="topbar pointer-events-auto gap-2 px-4 py-2.5 text-sm font-medium">
          <Check className="size-4 text-accent" />
          {t.studio.launched}
        </div>
      </div>
    )}
    <div className={L.page}>
      <div className="relative z-20 animate-fade-up">{composer}</div>

      <section ref={resultEnd} className={`${L.below} scroll-mt-24 space-y-3`}>
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
        {/* Les onglets posés sur la page, sans cadre autour : chaque rendu
            est déjà sa propre carte. */}
        <div className="animate-fade-up">
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
                <HistoryList items={pastItems} onReuse={reuse} />
              ) : (
                <p className="panel py-16 text-center text-sm text-muted">{t.studio.historyNone}</p>
              ))}
            {tab === "examples" && (
              <div className="panel p-4 sm:p-6">
                <ExamplesPanel onRecreate={recreateDemo} />
              </div>
            )}
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
  // rendu, le clip joue tamisé et la photo du personnage annonce ce qui est
  // en train de naître. Absents à la reprise d'un rendu après rechargement.
  sourcePreview?: string;
  characterPreview?: string;
  onReset: () => void;
  // Refait une séquence d'un remplacement terminé.
  onRedo: (index: number) => void;
  onCancel: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [cancelling, setCancelling] = useState(false);

  // Scène du rendu, au style de la landing : l'image à gauche, à droite le
  // titre en deux temps, la fabrication (chrono, étapes) puis les actions.
  if (phase.kind === "error") {
    return (
      <section className={`${R.card} animate-fade-up`}>
        <div className="flex flex-col items-start gap-5 p-6 sm:p-8">
          <div role="alert" className="flex max-w-xl items-start gap-3 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{phase.message}</p>
          </div>
          <button type="button" onClick={onReset} className="btn btn-accent">
            <RefreshCw />
            {t.studio.newVideo}
          </button>
        </div>
      </section>
    );
  }

  const making = phase.kind === "generating";
  // Pas pendant le montage : trop tard, la vidéo arrive.
  const cancellable = making && Boolean(phase.id) && phase.view?.stage !== "assembling";
  // Ambiance : la vidéo (ou le clip pendant la fabrication), très floue,
  // éclaire toute la carte.
  const ambient = phase.kind === "done" ? phase.view.mediaUrl : sourcePreview;
  const settings = phase.kind === "done" ? phase.view.settings : undefined;

  return (
    <section className={`${R.card} animate-fade-up`}>
      {ambient && (
        <video key={ambient} src={ambient} muted loop autoPlay playsInline aria-hidden className={R.ambient} />
      )}
      <span aria-hidden className={R.veil} />
      <div className={R.grid}>
        <div className="min-w-0">
          <ResultStage
            // Nouvelle scène par rendu : le fondu rejoue pour chaque vidéo.
            key={phase.id}
            aspectRatio={phase.job.aspectRatio}
            mediaUrl={phase.kind === "done" ? phase.view.mediaUrl : undefined}
            backdrop={sourcePreview}
            overlay={
              making && (
                <div className={R.making}>
                  {characterPreview && (
                    // Aperçu local (blob:) : pas d'optimisation Next.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={characterPreview} alt="" className={R.portrait} />
                  )}
                  <span aria-hidden className={R.scan} />
                </div>
              )
            }
          />
        </div>

        <aside className={R.side}>
          <div>
            <p className="eyebrow">{making ? t.studio.makingEyebrow : t.studio.doneEyebrow}</p>
            <h2 className={`${R.title} mt-3`}>
              {making ? t.studio.makingTop : t.studio.doneTop} <em>{making ? t.studio.makingBottom : t.studio.doneBottom}</em>
            </h2>
          </div>

          {making ? (
            <Process phase={phase} />
          ) : (
            <>
              <ul className={R.facts}>
                <li>{fmt(t.videos.seconds, { seconds: phase.job.durationSeconds })}</li>
                {settings?.quality && <li>{settings.quality}</li>}
                <li>{phase.job.aspectRatio}</li>
                {settings?.model && <li>{settings.model === "max" ? t.studio.modelMax : t.studio.modelStandard}</li>}
              </ul>
              {phase.view.unreplaced > 0 && (
                <p className={R.note}>
                  {fmt(t.studio.incomplete, {
                    done: phase.view.shotsTotal - phase.view.unreplaced,
                    total: phase.view.shotsTotal,
                  })}
                </p>
              )}
              {phase.view.notice && <p className={R.note}>{phase.view.notice}</p>}
              {phase.view.parts.length > 1 && (
                <div className={R.redo}>
                  <p>{phase.view.engine === "genjutsu" ? t.studio.redoSequenceTitle : t.studio.redoTitle}</p>
                  {phase.view.parts.map((part, i) => {
                    const sequence = phase.view.engine === "genjutsu";
                    const cost = swapShotCredits(part.seconds, phase.view.engine, phase.view.settings, phase.view.face);
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
                        className={part.flagged ? R.flagged : undefined}
                      >
                        <span className="min-w-0 truncate">
                          {fmt(sequence ? t.studio.sequence : t.studio.shot, { n: i + 1 })} · {part.start.toFixed(1)}–
                          {(part.start + part.seconds).toFixed(1)} s{part.flagged && ` · ${part.reason ?? t.studio.shotFlagged}`}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 tabular-nums opacity-70">
                          <RefreshCw className="size-3.5" />
                          {cost}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className={R.actions}>
            {phase.kind === "done" && (
              <>
                <a href={phase.view.downloadUrl ?? phase.view.mediaUrl} className="btn btn-accent">
                  <Download />
                  {t.studio.download}
                </a>
                <div className={R.pair}>
                  <button
                    type="button"
                    onClick={() => askBotsToAnalyze(phase.id, phase.view.mediaUrl)}
                    title={t.viral.analyzeHint}
                    className="btn btn-secondary"
                  >
                    <Sparkles />
                    {t.viral.analyzeShort}
                  </button>
                  <Link href="/dashboard/planning" title={t.shell.navHint.planning} className="btn btn-secondary">
                    <CalendarClock />
                    {t.shell.nav.planning}
                  </Link>
                </div>
              </>
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
            {!making && (
              <button type="button" onClick={onReset} className="btn btn-ghost">
                <RefreshCw />
                {t.studio.newVideo}
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

// Fabrication en cours : un chrono, une barre (remplie quand l'avancée est
// connue, sinon un trait qui court), le délai annoncé, et les quatre étapes
// qui se cochent l'une après l'autre.
function Process({ phase }: { phase: Extract<Phase, { kind: "generating" }> }) {
  const { t } = useI18n();
  const view = phase.view;
  // Passé le délai annoncé depuis que le créateur regarde ce rendu, on le dit
  // plutôt que de répéter la même estimation.
  const minutes = genjutsuMinutes(phase.job.durationSeconds) * (phase.job.vessel ? 2 : 1);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase.id]);
  const late = elapsed > minutes * 60;
  const assembling = view?.stage === "assembling";

  // Avancée connue : images clés puis plans (Kling), ou séquences (Shinka).
  let progress: number | null = null;
  let label = t.studio.swapping;
  if (assembling) {
    label = t.studio.assembling;
  } else if (view && view.engine === "kling" && view.shotsTotal > 0) {
    const keyframes = view.framesDone < view.shotsTotal;
    const done = keyframes ? view.framesDone : view.shotsDone;
    progress = (done / view.shotsTotal / 2 + (keyframes ? 0 : 0.5)) * 100;
    label = `${keyframes ? t.studio.keyframes : t.studio.shots} · ${done}/${view.shotsTotal}`;
  } else if (view?.engine === "genjutsu" && view.shotsTotal > 1) {
    progress = (view.shotsDone / view.shotsTotal) * 100;
    label = `${t.studio.sequences} · ${view.shotsDone}/${view.shotsTotal}`;
  }
  const hint = late ? t.studio.lateHint : view?.engine === "genjutsu" ? fmt(t.studio.genjutsuHint, { minutes }) : t.studio.progressHint;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  // Étapes : images et mouvements sont prêts au lancement ; le remplacement
  // tourne jusqu'au montage, qui tourne jusqu'à la vidéo finie.
  const steps = t.landing.mockSteps;
  const state = (i: number) => (i < 2 ? "done" : i === 2 ? (assembling ? "done" : "now") : assembling ? "now" : "todo");

  return (
    <div className="grid gap-4">
      <div>
        <p className={R.clock}>
          <b>{clock}</b>
          <span>{t.studio.elapsed}</span>
        </p>
        <p className="mt-1 text-sm font-medium">{label}</p>
      </div>
      <div className={R.bar}>
        {progress === null ? <span className={R.run} /> : <span className={R.fill} style={{ width: `${Math.max(progress, 4)}%` }} />}
      </div>
      <p className={R.hint}>{hint}</p>
      <ol className={R.steps}>
        {steps.map((step, i) => {
          const st = state(i);
          return (
            <li key={step} className={`${R.step} ${st === "done" ? R.done : st === "now" ? R.now : ""}`}>
              <span className={R.dot}>{st === "done" ? <Check /> : i + 1}</span>
              {step}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
