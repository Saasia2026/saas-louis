// Langues du site. La langue choisie est gardée dans un cookie ; à la
// première visite, elle vient de la langue du navigateur.

export const LOCALES = ["fr", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "lang";

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
};

// Locale Intl (prix, nombres).
export const INTL_LOCALES: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

// Première langue supportée d'un en-tête Accept-Language.
export function localeFromAcceptLanguage(header: string | null): Locale {
  for (const part of (header ?? "").split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

// Remplace les {variables} d'un texte traduit.
export function fmt(text: string, vars: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

// Singulier ou pluriel selon le nombre.
export function plural(count: number, one: string, other: string) {
  return Math.abs(count) <= 1 ? one : other;
}
