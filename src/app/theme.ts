// Thème clair / sombre choisi par l'utilisateur (sans choix : celui de
// l'appareil, géré en CSS). Partagé client / serveur.
export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}
