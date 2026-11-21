"use client";

import type { Ref } from "react";

// Les deux bots ne sont plus que des yeux : une petite tête qui dépasse du
// bas de l'écran (ou de la barre du bas sur téléphone). Scout a la tête
// blanche et les yeux noirs, Hook la tête sombre et les yeux blancs.
//
// `pupilsRef` : groupe des pupilles, que l'aquarium déplace (regard) ;
// `lidsRef` : groupe des yeux entiers, qu'il écrase (clignement). Les
// déplacements sont en unités du dessin (100 de large).

type Props = {
  pupilsRef?: Ref<SVGGElement>;
  lidsRef?: Ref<SVGGElement>;
  className?: string;
  // Gardés pour les appels existants (avatars) : sans effet.
  talking?: boolean;
  still?: boolean;
};

// Vidéo de l'en-tête de la fenêtre de chaque bot (sans extension).
const wall = (n: string) => `/demos/wall/demo-${n}`;
export const BOT_VIDEO = { scout: wall("17"), hook: wall("19") } as const;

const LOOK = {
  scout: { skin: "#ffffff", line: "none", white: "#0c0c10", pupil: "#ffffff" },
  hook: { skin: "#16161c", line: "rgb(255 255 255 / 0.42)", white: "#ffffff", pupil: "#0c0c10" },
} as const;

function Eyes({ bot, pupilsRef, lidsRef, y }: { bot: keyof typeof LOOK; pupilsRef?: Ref<SVGGElement>; lidsRef?: Ref<SVGGElement>; y: number }) {
  const c = LOOK[bot];
  return (
    <g ref={lidsRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
      <ellipse cx="34" cy={y} rx="12" ry="14" fill={c.white} />
      <ellipse cx="66" cy={y} rx="12" ry="14" fill={c.white} />
      <g ref={pupilsRef}>
        <ellipse cx="35.5" cy={y + 1} rx="5.6" ry="6.4" fill={c.pupil} />
        <ellipse cx="67.5" cy={y + 1} rx="5.6" ry="6.4" fill={c.pupil} />
      </g>
    </g>
  );
}

// La tête qui dépasse : un dôme, ouvert en bas (caché par le bord).
export function BotHead({ bot, pupilsRef, lidsRef, className }: Props & { bot: keyof typeof LOOK }) {
  const c = LOOK[bot];
  return (
    <svg viewBox="0 0 100 110" className={className} aria-hidden>
      <path d="M2 110 V50 A48 48 0 0 1 98 50 V110 Z" fill={c.skin} stroke={c.line} strokeWidth="2" />
      <Eyes bot={bot} pupilsRef={pupilsRef} lidsRef={lidsRef} y={40} />
    </svg>
  );
}

// Avatar rond (fenêtre de discussion, messages, bouton de retour des bots).
function Avatar({ bot, className }: Props & { bot: keyof typeof LOOK }) {
  const c = LOOK[bot];
  return (
    <svg viewBox="0 0 100 100" className={`block ${className ?? ""}`} aria-hidden>
      <circle cx="50" cy="50" r="48" fill={c.skin} stroke={c.line} strokeWidth="2" />
      <Eyes bot={bot} y={48} />
    </svg>
  );
}

export function ScoutFace(props: Props) {
  return <Avatar {...props} bot="scout" />;
}

export function HookFace(props: Props) {
  return <Avatar {...props} bot="hook" />;
}
