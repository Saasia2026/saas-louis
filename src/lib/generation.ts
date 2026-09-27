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
//   sans nouvel essai automatique : 7 crédits la seconde, 90 s au plus ;
// - kling (Kling O3 Pro Edit) : 0,168 $ la seconde, plus l'image clé de
//   chaque plan (~0,15 $) et les plans refaits après contrôle : 2,5 crédits
//   la seconde, 15 s au plus.
// La fiche personnage (deux images Nano Banana Pro, ~0,30 $) : 3 crédits.
export const SWAP_ENGINES = {facefusion: { creditsPerSecond: 0.5, maxSeconds: 120 },
  genjutsu: { creditsPerSecond: 7, maxSeconds: 90 },
  kling: { creditsPerSecond: 2.5, maxSeconds: 15 },
} as const;

export type SwapEngine = keyof typeof SWAP_ENGINES;
export const DEFAULT_SWAP_ENGINE: SwapEngine = "kling";

export function isSwapEngine(value: unknown): value is SwapEngine {
  return typeof value === "string" && value in SWAP_ENGINES;
}

export const SWAP_SHEET_CREDITS = 3;
// Genjutsu en 1080p : 1,632 $ la seconde chez Higgsfield (vérifié le
// 2026-09-26), soit 17 crédits la seconde pour rester sous 0,10 $ par crédit.
export const GENJUTSU_HD_CREDITS_PER_SECOND = 17;

// Crédits par seconde d'un moteur, 1080p compris (genjutsu seulement).
export function swapRate(engine: SwapEngine, hd = false) {
  return engine === "genjutsu" && hd
    ? GENJUTSU_HD_CREDITS_PER_SECOND
    : SWAP_ENGINES[engine].creditsPerSecond;
}

// Photos d'un personnage envoyées à Genjutsu (en pied, visage, profil…) :
// Higgsfield accepte 8 images de référence par envoi, tous personnages confondus.
export const GENJUTSU_MAX_IMAGES = 8;
export const SWAP_MAX_PHOTOS_PER_CHARACTER = 4;
export function photosPerCharacter(characters: number) {
  return Math.min(
    SWAP_MAX_PHOTOS_PER_CHARACTER,
    Math.floor(GENJUTSU_MAX_IMAGES / Math.max(1, characters)),
  );
}
// Personnages remplacés dans un même clip, au plus (moteur genjutsu ; kling
// n'en remplace qu'un). Aligné avec public.start_swap_generation.
export const SWAP_MAX_CHARACTERS = 3;
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

// Taille alignée avec le bucket swap-inputs.
export const SWAP_MAX_BYTES = 50 * 1024 * 1024;
export const SWAP_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
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
  hd = false,
) {
  const billed =
    engine === "genjutsu" ? genjutsuBilledSeconds([seconds]) : klingBilledSeconds([seconds]);
  return Math.max(1, Math.ceil(billed * swapRate(engine, hd)));
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
  // Genjutsu en 1080p.
  hd = false,
) {
  const seconds =
    billedSeconds !== undefined
      ? Math.max(billedSeconds, Math.ceil(durationSeconds))
      : Math.ceil(durationSeconds);
  const sheet = engine === "facefusion" ? 0 : SWAP_SHEET_CREDITS * characters;
  return Math.ceil(seconds * swapRate(engine, hd)) + sheet;
}

// Secondes de remplacement qu'un nombre de crédits permet, fiche comprise.
export function swapSecondsFor(credits: number, engine: SwapEngine) {
  return Math.max(
    0,
    Math.floor((credits - SWAP_SHEET_CREDITS) / SWAP_ENGINES[engine].creditsPerSecond),
  );
}
