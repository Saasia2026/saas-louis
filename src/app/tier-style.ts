import type { CSSProperties } from "react";

// Teinte de chaque offre (variables --tier-*, plus foncées en thème clair) et
// force du dégradé de sa carte ; Pro est la plus mise en avant.
export const TIERS = {
  starter: { color: "var(--tier-basic)", strength: 14, badge: null },
  creator: { color: "var(--tier-pro)", strength: 26, badge: "popular" },
  studio: { color: "var(--tier-creator)", strength: 18, badge: "best" },
} as const;

export function tierCard(color: string, strength: number): CSSProperties {
  return {
    background: `linear-gradient(165deg, color-mix(in oklab, ${color} ${strength}%, var(--surface)) 0%, var(--surface) 62%)`,
    borderColor: `color-mix(in oklab, ${color} 38%, var(--line))`,
  };
}

// Badges penchés : réduction en rose, mention d'offre à côté.
export const BADGE = "inline-flex -skew-x-6 items-center rounded-md px-2 py-0.5 text-xs font-extrabold italic";
export const OFF_BADGE = `${BADGE} bg-rose-600 text-white`;
