// Code partenaire : vient du lien twinpost.video/?ref=archie (posé par le
// proxy) ou du champ « code » à l'inscription. Gardé 30 jours, le temps que
// le visiteur revienne s'inscrire. Fichier sans dépendance serveur : le proxy
// l'importe aussi.
export const REF_COOKIE = "tp_ref";
export const REF_MAX_AGE = 60 * 60 * 24 * 30;

export function normalizeRefCode(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,32}$/.test(code) ? code : null;
}

export const refCookieOptions = {
  maxAge: REF_MAX_AGE,
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;
