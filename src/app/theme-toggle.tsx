"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/provider";
import { THEME_COOKIE, type Theme } from "./theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

// Thème affiché : le choix enregistré (data-theme sur <html>), sinon celui de
// l'appareil.
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

// Suit les changements de data-theme et du thème de l'appareil.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  const media = window.matchMedia(LIGHT_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

// Bascule clair / sombre. Le choix est appliqué tout de suite et gardé un an
// dans un cookie, lu par le layout racine pour éviter tout flash au chargement.
export function ThemeToggle() {
  const { t } = useI18n();
  // Côté serveur, le thème du navigateur est inconnu : icône neutre.
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  const label = theme === "light" ? t.common.themeDark : t.common.themeLight;

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="btn btn-ghost relative size-9 overflow-hidden p-0"
    >
      <Sun
        className={`absolute transition-all duration-500 ${
          theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
        }`}
      />
      <Moon
        className={`absolute transition-all duration-500 ${
          theme === "light" ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
    </button>
  );
}
