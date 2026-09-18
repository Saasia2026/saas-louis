// Options de génération, partagées client/serveur.

export const GENERATIONS_BUCKET = "generations";
export const MAX_PROMPT_LENGTH = 1000;

// Durée d'un plan par défaut : les plans sont générés un par un, puis
// assemblés.
export const VIDEO_STEP_SECONDS = 5;

// Modèles d'animation au choix, tous sur fal (FAL_KEY requis).
// creditsPerSecond est aligné avec public.video_model_credits_per_second.
export const VIDEO_MODELS = [
  {
    // Sora 2 : plans de 8 s avec le son généré (ambiance, voix), et
    // personnages réutilisables. Le plus cher, et le plus réaliste.
    id: "sora-2",
    label: "Sora 2",
    hint: "Avec le son, plans de 8 s",
    creditsPerSecond: 5,
    endFrames: false,
    direct: true,
    shotSeconds: 8,
    audio: true,
  },
  {
    // Modèles « références → vidéo » : ils reçoivent les photos du jumeau et
    // la scène, et rendent le plan directement, sans image intermédiaire.
    id: "wan-2.7",
    label: "Wan 2.7",
    hint: "Vidéo directe, 1080p",
    creditsPerSecond: 1,
    endFrames: false,
    direct: true,
  },
  {
    id: "seedance-lite",
    label: "Seedance 1 Lite",
    hint: "Vidéo directe, 720p",
    creditsPerSecond: 1,
    endFrames: false,
    direct: true,
  },
  {
    id: "kling-2.5",
    label: "Kling 2.5 Turbo",
    hint: "Rapide et fiable",
    creditsPerSecond: 1,
    // Ce modèle n'accepte pas d'image de fin de plan.
    endFrames: false,
    direct: false,
  },
  {
    id: "seedance-1.5",
    label: "Seedance 1.5 Pro",
    hint: "Mouvements naturels",
    creditsPerSecond: 1,
    endFrames: true,
    direct: false,
  },
  {
    id: "kling-3",
    label: "Kling 3.0 Pro",
    hint: "Qualité cinéma",
    creditsPerSecond: 2,
    endFrames: true,
    direct: false,
  },
  {
    // Kling O1 avec la vidéo de référence du créateur : chaque plan reprend
    // la caméra, la vitesse et le rendu de la vraie vidéo, pas d'une
    // description (voir reference.ts). fal : 0,168 $ la seconde.
    id: "kling-o1-ref",
    label: "Kling O1 Référence",
    hint: "Suit ta vidéo de référence",
    creditsPerSecond: 2,
    endFrames: false,
    direct: true,
  },
] as const;

export type VideoModelId = (typeof VIDEO_MODELS)[number]["id"];

// Durée d'un plan produit par ce modèle (5 s par défaut).
export function shotSecondsOf(videoModel: VideoModelId) {
  const model = findVideoModel(videoModel);
  return model && "shotSeconds" in model ? model.shotSeconds : 5;
}

// Ce modèle génère aussi le son.
export function hasAudio(videoModel: VideoModelId) {
  const model = findVideoModel(videoModel);
  return Boolean(model && "audio" in model && model.audio);
}
export const DEFAULT_VIDEO_MODEL: VideoModelId = "kling-2.5";

export function findVideoModel(id: unknown) {
  return VIDEO_MODELS.find((m) => m.id === id);
}

// Modèles d'image à références (voir fal.ts). "1K" suffit à alimenter une
// vidéo 1080p et va plus vite que "2K".
export type ImageModelId = "seedream-4.5" | "nano-banana-pro";

// Un préréglage choisit tout ce qui joue sur le temps d'attente et le prix.
// Les deux vont du texte (ou des photos du jumeau) directement à la vidéo :
// aucune image intermédiaire n'est générée.
export const PRESETS = [
  {
    id: "realistic",
    label: "Réaliste",
    hint: "Sora 2, avec le son",
    imageModel: "nano-banana-pro",
    resolution: "1K",
    videoModel: "sora-2",
    endFrames: false,
  },
  {
    id: "fast",
    label: "Rapide",
    hint: "Vidéo directe, 720p",
    imageModel: "seedream-4.5",
    resolution: "1K",
    videoModel: "seedance-lite",
    endFrames: false,
  },
  {
    id: "balanced",
    label: "Naturel",
    hint: "Vidéo directe, 1080p",
    imageModel: "nano-banana-pro",
    resolution: "1K",
    videoModel: "wan-2.7",
    endFrames: false,
  },
  {
    // Réservé aux vidéos avec une vidéo de référence (availablePresets).
    id: "reference",
    label: "Référence",
    hint: "Kling O1, suit ta vidéo de référence",
    imageModel: "nano-banana-pro",
    resolution: "1K",
    videoModel: "kling-o1-ref",
    endFrames: false,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  hint: string;
  imageModel: ImageModelId;
  resolution: "1K" | "2K";
  videoModel: VideoModelId;
  endFrames: boolean;
}[];

// Un préréglage en vidéo directe ne génère aucune image intermédiaire.
export function isDirectPreset(preset: Preset) {
  return findVideoModel(preset.videoModel)?.direct === true;
}

export type Preset = (typeof PRESETS)[number];
export type PresetId = Preset["id"];
export const DEFAULT_PRESET: PresetId = "realistic";

export function findPreset(id: unknown): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

// Préréglages vidéo utilisables : aucun sans FAL_KEY. Sora 2 refuse les
// photos de personnes réelles : pas de Sora avec un jumeau.
export function availablePresets(falEnabled: boolean, withTwin: boolean, withReference = false) {
  if (!falEnabled) return [];
  // Avec une vidéo de référence, seul Kling O1 la reçoit vraiment. Sans
  // jumeau uniquement : le jumeau passe par des photos, pas par elle.
  if (withReference && !withTwin) return PRESETS.filter((p) => p.id === "reference");
  return PRESETS.filter(
    (p) => p.id !== "reference" && (!withTwin || p.videoModel !== "sora-2"),
  );
}

// Alignés avec public.start_generation et public.max_video_seconds.
export const IMAGE_COST = 1;
export const MAX_VIDEO_SECONDS: Record<string, number> = {
  free: 30,
  creator: 180,
  pro: 300,
};

export function maxVideoSeconds(plan: string) {
  return MAX_VIDEO_SECONDS[plan] ?? MAX_VIDEO_SECONDS.free;
}

// "swap" : remplacement de personnage dans un clip déposé par l'utilisateur
// (voir generate/swap-actions.ts), lancé à part de generate().
export type GenerationKind = "video" | "image" | "swap";

export function isGenerationKind(value: unknown): value is GenerationKind {
  return value === "video" || value === "image" || value === "swap";
}

// Remplacement de personnage. Alignés avec public.start_swap_generation.
export const SWAP_INPUTS_BUCKET = "swap-inputs";
export const SWAP_CREDITS_PER_SECOND = 1;
export const SWAP_MAX_SECONDS = 15;
// Taille alignée avec le bucket swap-inputs.
export const SWAP_MAX_BYTES = 50 * 1024 * 1024;
export const SWAP_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const SWAP_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Rythme du montage. Chaque plan est toujours animé sur 5 s ; en rythme
// rapide, seules les 2,5 premières secondes sont gardées, ce qui double le
// nombre de plans (et le coût) pour une même durée.
export const PACES = [
  { id: "normal", label: "Posé", hint: "Plans entiers" },
  { id: "fast", label: "Rapide", hint: "Plans coupés en deux, 2× plus de plans" },
] as const;

export type Pace = (typeof PACES)[number]["id"];
export const DEFAULT_PACE: Pace = "normal";
// Secondes gardées au montage pour un plan. Le rythme rapide ne coupe que
// les plans de 5 s : les modèles à plans longs (Sora) les gardent entiers.
export function keptSeconds(presetId: PresetId = DEFAULT_PRESET, pace: Pace = DEFAULT_PACE) {
  const shot = shotSecondsOf((findPreset(presetId) ?? PRESETS[0]).videoModel);
  return pace === "fast" && shot === 5 ? shot / 2 : shot;
}

export function isPace(value: unknown): value is Pace {
  return PACES.some((p) => p.id === value);
}

// Nombre de plans d'une vidéo, selon le modèle et le rythme.
export function shotCount(
  durationSeconds: number,
  presetId: PresetId = DEFAULT_PRESET,
  pace: Pace = DEFAULT_PACE,
) {
  return Math.floor(durationSeconds / keptSeconds(presetId, pace));
}

// Aligné avec public.start_generation : le rythme rapide double le nombre de
// plans, et une image de fin par plan coûte un crédit de plus.
export function costOf(
  kind: GenerationKind,
  durationSeconds: number,
  presetId: PresetId = DEFAULT_PRESET,
  pace: Pace = DEFAULT_PACE,
) {
  if (kind === "image") return IMAGE_COST;
  if (kind === "swap") return Math.ceil(durationSeconds) * SWAP_CREDITS_PER_SECOND;
  const preset = findPreset(presetId) ?? PRESETS[0];
  const shots = shotCount(durationSeconds, presetId, pace);
  const perSecond = findVideoModel(preset.videoModel)?.creditsPerSecond ?? 1;
  const fast = keptSeconds(presetId, pace) < shotSecondsOf(preset.videoModel);
  return Math.ceil(durationSeconds * perSecond * (fast ? 2 : 1)) + (preset.endFrames ? shots : 0);
}

// Durée générée de chaque plan (avant coupe au montage).
export function shotDurations(
  durationSeconds: number,
  presetId: PresetId = DEFAULT_PRESET,
  pace: Pace = DEFAULT_PACE,
): number[] {
  const shot = shotSecondsOf((findPreset(presetId) ?? PRESETS[0]).videoModel);
  return Array(shotCount(durationSeconds, presetId, pace)).fill(shot);
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}

export const FORMATS = [
  { value: "9:16", label: "Story", hint: "9:16" },
  { value: "1:1", label: "Carré", hint: "1:1" },
  { value: "16:9", label: "Paysage", hint: "16:9" },
] as const;

export type AspectRatio = (typeof FORMATS)[number]["value"];

export function isAspectRatio(value: unknown): value is AspectRatio {
  return FORMATS.some((f) => f.value === value);
}

export const PROMPT_SUGGESTIONS = [
  "En terrasse d'un café parisien",
  "Sur scène devant un public",
  "Dans un bureau moderne",
  "En voyage à Tokyo",
  "Shooting studio fond blanc",
];

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";
