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

// En développement seulement : un plan d'essai sur la copie d'un clip de
// test, pour voir la rangée sans vrais plans.
const TEST_PRESET: SwapPreset = {
  id: "test-a",
  path: "presets/test-a.mp4",
  seconds: 12,
  aspectRatio: "9:16",
  title: { fr: "Plan d'essai", en: "Test shot", es: "Plano de prueba" },
  people: [
    {
      target: "the main person",
      label: { fr: "la personne principale", en: "the main person", es: "la persona principal" },
    },
  ],
};

export const SWAP_PRESETS: SwapPreset[] = [
  ...(process.env.NODE_ENV === "development" ? [TEST_PRESET] : []),
];

export function presetById(id: unknown) {
  return typeof id === "string" ? SWAP_PRESETS.find((p) => p.id === id) : undefined;
}
