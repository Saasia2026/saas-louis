// Analyse de viralité, partagée client/serveur : le prix, les limites et la
// forme du rapport. Le travail lui-même est dans virality-analysis.ts.
//
// Une relecture critique du clip avant publication (accroche, rythme, son,
// fin, envie de partager), pas une prédiction de vues : aucun modèle ne les
// prédit, la page ne prétend jamais le faire.

// Coût estimé (pas encore mesuré sur un vrai rendu) : ~0,15 $ l'analyse
// (Claude Opus 5.5 sur ~40 images et la transcription, plus la
// transcription chez fal), soit ~6 crédits au coût par crédit du barème
// (0,0243 $, voir generation.ts). Les jetons de chaque analyse sont
// journalisés (« virality: usage ») pour ajuster ce prix.
export const VIRALITY_CREDITS = 8;
export const VIRALITY_MIN_SECONDS = 2;
export const VIRALITY_MAX_SECONDS = 90;

export const VIRALITY_CRITERIA = ["hook", "pacing", "clarity", "sound", "ending", "shareability"] as const;
export type ViralityCriterion = (typeof VIRALITY_CRITERIA)[number];

export type ViralityReport = {
  // Note d'ensemble sur 100.
  score: number;
  // Le constat en une phrase.
  verdict: string;
  // Seconde où l'accroche tombe (ce qui retient le pouce).
  hookAt: number;
  criteria: { key: ViralityCriterion; score: number; note: string }[];
  // Moments forts et moments où l'on risque de décrocher.
  moments: { at: number; kind: "strong" | "risk"; note: string }[];
  // Corrections concrètes, de la plus utile à la moins utile.
  fixes: { title: string; detail: string }[];
  // Passage à garder, quand couper le début ou la fin aide vraiment.
  keep: { start: number; end: number; reason: string } | null;
  caption: string;
  hashtags: string[];
};

// Mesures faites par ffmpeg, montrées avec le rapport.
export type ViralityFacts = {
  seconds: number;
  aspectRatio: string;
  cuts: number[];
  hasAudio: boolean;
  speech: boolean;
};

export type ViralityAnalysis = {
  id: string;
  report: ViralityReport;
  facts: ViralityFacts;
  videoUrl: string;
  date: string;
};

export function scoreTone(score: number) {
  return score >= 70 ? "good" : score >= 45 ? "mid" : "low";
}
