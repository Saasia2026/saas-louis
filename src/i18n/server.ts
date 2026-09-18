import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "./config";
import { dictionaryFor } from "./dictionaries";

// Langue de la requête : le cookie choisi par l'utilisateur, sinon celle du
// navigateur.
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export async function getDictionary() {
  return dictionaryFor(await getLocale());
}
