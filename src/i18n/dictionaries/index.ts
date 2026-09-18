import type { Locale } from "../config";
import { en } from "./en";
import { es } from "./es";
import { fr, type Dictionary } from "./fr";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en, es };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
