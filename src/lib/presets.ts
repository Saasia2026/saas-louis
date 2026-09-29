import type { Locale } from "@/i18n/config";
import type { AspectRatio } from "@/lib/generation";

// Plans prêts : des clips choisis d'avance, dont on sait qu'ils passent bien
// au remplacement (personne nette, bien éclairée, peu de croisements). Le
// créateur n'apporte que les personnages ; qui chacun remplace est fixé ici,
// pour le moteur (`target`, en anglais) et pour le créateur (`label`). Les
// vidéos sont rangées dans le bucket swap-inputs sous presets/, déposées à la
// main dans Supabase, et servies par URL signée (voir GeneratePage). Un plan
// dont le fichier manque n'est pas proposé.
export type SwapPreset = {
  id: string;
  path: `presets/${string}`;
  seconds: number;
  aspectRatio: AspectRatio;
  title: Record<Locale, string>;
  people: { target: string; label: Record<Locale, string> }[];
};

// Liste vide : le créateur apporte son propre clip. Le plan « Au micro »
// (presets/podcast-1.mp4, 12 s, 9:16) reste dans le bucket, prêt à être
// réinscrit ici quand l'offre de plans se garnira — les plans rendus par
// scripts/vessel.mjs portent tous la même cible, le mannequin gris :
// { target: "the person in the plain grey t-shirt and grey trousers",
//   label: { fr: "la personne en gris", en: "the person in grey", es: "la persona de gris" } }
export const SWAP_PRESETS: SwapPreset[] = [];

export function presetById(id: unknown) {
  return typeof id === "string" ? SWAP_PRESETS.find((p) => p.id === id) : undefined;
}
