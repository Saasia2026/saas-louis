// Options du remplacement de personnage, partagées client/serveur.
//
// L'app fait une seule chose : dans un clip filmé, remplacer une personne par
// un personnage donné en photo, en gardant ses gestes, le décor, la caméra et
// le son (voir swap.ts).

export const GENERATIONS_BUCKET = "generations";

// Clip et image du personnage déposés par le navigateur.
// Alignés avec public.start_swap_generation.
export const SWAP_INPUTS_BUCKET = "swap-inputs";
// Moteurs du remplacement :
// - genjutsu (Higgsfield Genjutsu Object Swap) : 0,681 $ la seconde en 720p.
//   Il suit les coupes tout seul ; le passage est rendu en séquences de
//   quelques secondes, toutes en même temps (voir GENJUTSU_BLOCK_SECONDS),
//   sans nouvel essai automatique : 28 crédits la seconde, 30 s au plus ;
// - kling (Kling O3 Pro Edit) : 0,168 $ la seconde, plus l'image clé de
//   chaque plan (~0,15 $) et les plans refaits après contrôle : 10 crédits
//   la seconde, 15 s au plus ;
// - magichour (Magic Hour Face Swap Video) : seul le visage change, le reste
//   du clip est gardé. ~0,03 $ la seconde (1 crédit Magic Hour par image) :
//   4 crédits la seconde, 90 s au plus, sans fiche personnage.
// Plus de fiche personnage facturée depuis le 2026-11-05 : les images du
// créateur partent telles quelles chez Higgsfield.
// Barèmes alignés avec public.start_swap_generation.
export const SWAP_ENGINES = {
  genjutsu: { creditsPerSecond: 28, maxSeconds: 30 },
  kling: { creditsPerSecond: 10, maxSeconds: 15 },
  magichour: { creditsPerSecond: 4, maxSeconds: 90 },
} as const;

export type SwapEngine = keyof typeof SWAP_ENGINES;
export const DEFAULT_SWAP_ENGINE: SwapEngine = "kling";

export function isSwapEngine(value: unknown): value is SwapEngine {
  return typeof value === "string" && value in SWAP_ENGINES;
}

// Deux modèles Genjutsu chez Higgsfield, nommés autrement sur le site :
// - standard : « Genjutsu Light » chez Higgsfield (sorti le 2026-10-20),
//   affiché « Shinka ». 0,05 / 0,10 / 0,20 $ la seconde en 480p / 720p /
//   1080p, 15 s au plus par requête ;
// - max : « Genjutsu » chez Higgsfield, affiché « Shinka Max ». 0,318 /
//   0,681 / 1,632 $ la seconde.
// Crédits la seconde au même coût par crédit que le barème d'origine
// (0,681 $ = 28 crédits, soit ~0,0243 $ le crédit), arrondis au-dessus.
// Alignés avec public.start_swap_generation.
export const GENJUTSU_MODELS = ["standard", "max"] as const;
export type GenjutsuModel = (typeof GENJUTSU_MODELS)[number];
export const SWAP_QUALITIES = ["480p", "720p", "1080p"] as const;
export type SwapQuality = (typeof SWAP_QUALITIES)[number];
export const GENJUTSU_RATES: Record<GenjutsuModel, Record<SwapQuality, number>> = {
  standard: { "480p": 3, "720p": 5, "1080p": 9 },
  max: { "480p": 14, "720p": 28, "1080p": 68 },
};
export const DEFAULT_GENJUTSU_MODEL: GenjutsuModel = "max";
export const DEFAULT_SWAP_QUALITY: SwapQuality = "720p";
// Genjutsu Light ne lit que les 15 premières secondes de la vidéo reçue.
export const GENJUTSU_LIGHT_MAX_SECONDS = 15;

export type GenjutsuSettings = { model?: GenjutsuModel; quality?: SwapQuality };

export function isGenjutsuModel(value: unknown): value is GenjutsuModel {
  return typeof value === "string" && (GENJUTSU_MODELS as readonly string[]).includes(value);
}

export function isSwapQuality(value: unknown): value is SwapQuality {
  return typeof value === "string" && (SWAP_QUALITIES as readonly string[]).includes(value);
}

// Modèle et qualité d'un remplacement enregistré. Avant le 2026-11-02, seul
// Genjutsu Max existait et la qualité tenait dans `hd` (1080p ou 720p).
export function genjutsuSettingsOf(metadata: {
  hd?: boolean;
  quality?: unknown;
  model?: unknown;
}): Required<GenjutsuSettings> {
  return {
    model: isGenjutsuModel(metadata.model) ? metadata.model : "max",
    quality: isSwapQuality(metadata.quality) ? metadata.quality : metadata.hd ? "1080p" : "720p",
  };
}

export const SWAP_SHEET_CREDITS = 0;
// Fiche personnage d'un remplacement : Magic Hour lit la photo telle quelle.
export function swapSheetCredits(engine: SwapEngine, characters = 1) {
  return engine === "magichour" ? 0 : SWAP_SHEET_CREDITS * characters;
}
// Option « + visage exact » (Genjutsu ou Kling, un seul personnage) : Magic
// Hour pose ensuite le visage de la photo sur chaque morceau rendu, au tarif
// du moteur magichour. Aligné avec public.start_swap_generation.
export const FACE_PASS_CREDITS_PER_SECOND = SWAP_ENGINES.magichour.creditsPerSecond;
export function facePassCredits(seconds: number) {
  return Math.max(1, Math.ceil(seconds * FACE_PASS_CREDITS_PER_SECOND));
}
// Crédits par seconde d'un moteur ; genjutsu selon son modèle et sa qualité.
export function swapRate(engine: SwapEngine, settings: GenjutsuSettings = {}) {
  return engine === "genjutsu"
    ? GENJUTSU_RATES[settings.model ?? DEFAULT_GENJUTSU_MODEL][settings.quality ?? DEFAULT_SWAP_QUALITY]
    : SWAP_ENGINES[engine].creditsPerSecond;
}

// Crédits par seconde d'un remplacement : une passe Genjutsu par défaut ; en
// haute fidélité (méthode du mannequin), deux passes, celle des mannequins
// puis celle des personnages.
export function swapMethodRate(settings: GenjutsuSettings = {}, fidelity = false) {
  return swapRate("genjutsu", settings) * (fidelity ? 2 : 1);
}

// Photos d'un personnage envoyées à Genjutsu (en pied, visage, profil…) :
// Higgsfield accepte 8 images de référence par envoi, tous personnages confondus.
export const GENJUTSU_MAX_IMAGES = 8;
// Images par élément remplacé ; `reserved` : places déjà prises (le lieu).
export function photosPerCharacter(characters: number, reserved = 0) {
  return Math.max(1, Math.floor((GENJUTSU_MAX_IMAGES - reserved) / Math.max(1, characters)));
}
// Personnages remplacés dans un même clip, au plus : autant que d'images de
// référence acceptées par Genjutsu (kling n'en remplace qu'un). La base borne
// p_characters à 3 : le prix n'en dépend pas.
export const SWAP_MAX_CHARACTERS = GENJUTSU_MAX_IMAGES;
// Kling refuse un plan de moins de 3 s : un plan plus court lui est envoyé
// prolongé à cette durée (voir preparePart), et payé comme tel. Un clip très
// coupé se paie donc au nombre de plans, pas à sa seule durée.
export const KLING_MIN_PART_SECONDS = 3.2;

// Genjutsu : plans courts regroupés en séquences de GENJUTSU_BLOCK_SECONDS au
// plus, coupées aux changements de plan (une jonction sur une vraie coupe ne
// se voit pas) et rendues toutes en même temps : le rendu d'une vidéo dure à
// peu près celui d'une séquence, quelle que soit sa longueur. Un plan continu
// reste entier jusqu'à GENJUTSU_BLOCK_WHOLE_SECONDS : le couper ferait une
// jonction visible au milieu d'un geste, et le personnage pourrait changer
// d'une moitié à l'autre. Au-delà, il est coupé en parts égales d'au plus
// GENJUTSU_LONG_SHOT_PART_SECONDS.
// Higgsfield accepte jusqu'à 30 s par envoi.
// Higgsfield refuse une séquence de moins de 4 s (« Your video is too short »,
// constaté le 2026-09-19) : les séquences gardent une marge au-dessus.
export const GENJUTSU_MIN_SECONDS = 4.5;
export const GENJUTSU_BLOCK_SECONDS = 6;
export const GENJUTSU_BLOCK_WHOLE_SECONDS = 15;
export const GENJUTSU_LONG_SHOT_PART_SECONDS = 12;
export const GENJUTSU_BLOCK_MAX_SECONDS = 30;

// Images (30 par seconde) envoyées à Genjutsu pour une séquence. Higgsfield
// facture la durée reçue arrondie à la seconde supérieure : la séquence
// s'arrête donc un souffle avant une seconde pleine, pour qu'un fichier
// encodé un rien plus long ne bascule pas sur la seconde suivante. Les images
// retirées sont comblées au montage (voir concatenateParts).
export function genjutsuFrames(seconds: number) {
  const frames = Math.floor(seconds * 30 + 1e-6);
  const rest = frames % 30;
  const shaved = rest === 0 ? frames - 2 : rest === 29 ? frames - 1 : frames;
  // Jamais sous les 4 s que Genjutsu accepte : mieux vaut payer la seconde
  // entamée que se faire refuser la séquence.
  return Math.max(shaved, 120);
}

// Secondes facturées par Higgsfield pour des séquences de ces durées, en
// comptant large : un fichier encodé dépasse parfois sa durée d'une trentaine
// de millisecondes (dernier paquet de son).
export function genjutsuBilledSeconds(partSeconds: number[]) {
  return partSeconds.reduce((sum, s) => sum + Math.ceil(genjutsuFrames(s) / 30 + 0.04), 0);
}

// Secondes facturées par Kling pour des plans de ces durées.
export function klingBilledSeconds(partSeconds: number[]) {
  return partSeconds.reduce((sum, s) => sum + Math.max(s, KLING_MIN_PART_SECONDS), 0);
}

// Taille alignée avec le bucket swap-inputs : une vidéo de téléphone de 30 s
// (4K, 60 i/s) passe, Genjutsu la reçoit telle quelle.
export const SWAP_MAX_BYTES = 500 * 1024 * 1024;
export const SWAP_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Format d'affichage le plus proche de celui du clip (voir probeVideo).
export const FORMATS = [{ value: "9:16" }, { value: "1:1" }, { value: "16:9" }] as const;

export type AspectRatio = (typeof FORMATS)[number]["value"];

export function isAspectRatio(value: unknown): value is AspectRatio {
  return FORMATS.some((f) => f.value === value);
}

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

// Prix d'un plan (kling) ou d'une séquence (genjutsu) refait seul (voir redoSwapShot).
export function swapShotCredits(
  seconds: number,
  engine: SwapEngine = DEFAULT_SWAP_ENGINE,
  // Genjutsu : modèle et qualité.
  settings: GenjutsuSettings = {},
  // Option « + visage exact ».
  face = false,
  // Base neutre : la séquence passe deux fois par Genjutsu (voir swapCredits).
  vessel = false,
) {
  const billed =
    engine === "genjutsu"
      ? genjutsuBilledSeconds([seconds])
      : engine === "magichour"
        ? Math.ceil(seconds)
        : klingBilledSeconds([seconds]);
  const pass = face ? facePassCredits(billed) : 0;
  const passes = vessel && engine === "genjutsu" ? 2 : 1;
  return Math.max(1, Math.ceil(billed * swapRate(engine, settings))) * passes + pass;
}

// Prix d'un remplacement. Aligné avec public.start_swap_generation.
// `billedSeconds` : secondes réellement facturées par le moteur
// (klingBilledSeconds, genjutsuBilledSeconds), connues une fois le clip
// découpé ; sans elles, la durée du clip (prix minimal, affiché avant l'envoi).
export function swapCredits(
  durationSeconds: number,
  engine: SwapEngine = DEFAULT_SWAP_ENGINE,
  billedSeconds?: number,
  // Une fiche par personnage.
  characters = 1,
  // Genjutsu : modèle et qualité.
  settings: GenjutsuSettings = {},
  // Option « + visage exact ».
  face = false,
  // Base neutre (méthode du mannequin, Genjutsu seulement) : une première
  // passe remplace la personne du clip par un mannequin neutre, au même
  // tarif que la passe du personnage.
  vessel = false,
) {
  const seconds =
    billedSeconds !== undefined
      ? Math.max(billedSeconds, Math.ceil(durationSeconds))
      : Math.ceil(durationSeconds);
  const passes = vessel && engine === "genjutsu" ? 2 : 1;
  return (
    Math.ceil(seconds * swapRate(engine, settings)) * passes +
    swapSheetCredits(engine, characters) +
    (face ? facePassCredits(seconds) : 0)
  );
}

// Durée des vidéos courtes données en repère sur les offres : un
// remplacement pour TikTok tient souvent en quelques secondes.
export const SHORT_CLIP_SECONDS = 5;

// Vidéos de SHORT_CLIP_SECONDS (720p, un personnage, une passe) qu'un nombre
// de crédits permet, une fiche par vidéo. Genjutsu Max par défaut.
export function swapShortClipsFor(credits: number, settings: GenjutsuSettings = {}) {
  return Math.max(
    0,
    Math.floor(credits / (SHORT_CLIP_SECONDS * swapMethodRate(settings) + SWAP_SHEET_CREDITS)),
  );
}

// Secondes de remplacement (720p, un personnage, une passe) qu'un nombre de
// crédits permet, fiche comprise. Genjutsu Max par défaut.
export function swapMethodSecondsFor(credits: number, settings: GenjutsuSettings = {}) {
  return Math.max(0, Math.floor((credits - SWAP_SHEET_CREDITS) / swapMethodRate(settings)));
}
