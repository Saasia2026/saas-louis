import type { CSSProperties } from "react";

// Couleurs franches de la page de prix, sur le modèle de Higgsfield : Pro en
// citron vert, Creator en rose. Identiques en thème clair et sombre (les
// cartes portent leur propre fond et leur propre encre).
export const LIME = "#c8f04a";
export const PINK = "#f2479d";

export const PLAN_LOOK = {
  pro: {
    background: "linear-gradient(160deg, #efff8a 0%, #c2ec42 38%, #6e9a16 100%)",
    color: "#141a05",
    boxShadow: "0 24px 80px -24px rgb(200 240 74 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.5)",
  },
  creator: {
    background: "linear-gradient(160deg, #ffc2e6 0%, #f55aa8 40%, #9b1659 100%)",
    color: "#ffffff",
    boxShadow: "0 24px 80px -24px rgb(242 71 157 / 0.65), inset 0 1px 0 rgb(255 255 255 / 0.45)",
  },
} satisfies Record<string, CSSProperties>;

// Pastille de réduction penchée, rose vif.
export const HOT_PILL =
  "inline-flex -skew-x-6 items-center gap-1.5 rounded-md bg-[#f2479d] px-2 py-0.5 text-xs font-extrabold italic text-white tabular-nums";
// Pastille citron (réduction des recharges).
export const LIME_PILL =
  "inline-flex -skew-x-6 items-center rounded-md bg-[#c8f04a] px-2 py-0.5 text-xs font-extrabold italic text-[#141a05] tabular-nums";
