"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./config";
import { dictionaryFor, type Dictionary } from "./dictionaries";

const I18nContext = createContext<{ locale: Locale; t: Dictionary } | null>(null);

// Donne la langue aux composants client. Le dictionnaire est reconstruit ici
// à partir de la langue, pour ne pas le sérialiser depuis le serveur.
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, t: dictionaryFor(locale) }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n doit être utilisé sous <I18nProvider>");
  return value;
}
