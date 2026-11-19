"use client";

import { useId, type Ref } from "react";

// Les deux créatures, dessinées en SVG pour être animées : le fantôme irisé
// (Scout) et la tête de mort pastel (Hook). Les yeux sont un groupe à part,
// que l'aquarium déplace (regard) et écrase (clignement) à chaque image.

type Props = { eyesRef?: Ref<SVGGElement>; className?: string };

// Bas du fantôme : trois lobes, en deux positions pour l'ondulation.
const GHOST_A =
  "M50 4C24 4 8 22 8 50L8 86C8 98 12 105 19 105C25 105 27 97 32 97C38 97 42 107 50 107C58 107 62 97 68 97C73 97 75 105 81 105C88 105 92 98 92 86L92 50C92 22 76 4 50 4Z";
const GHOST_B =
  "M50 4C24 4 8 22 8 50L8 87C8 96 13 101 19 101C26 101 27 99 32 99C38 99 42 110 50 110C58 110 62 99 68 99C73 99 74 101 81 101C87 101 92 96 92 87L92 50C92 22 76 4 50 4Z";

export function Ghost({ eyesRef, className }: Props) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 112" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-body`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#a9dcff" />
          <stop offset="0.32" stopColor="#b3a6f2" />
          <stop offset="0.55" stopColor="#e3a2cf" />
          <stop offset="0.75" stopColor="#f5c39d" />
          <stop offset="1" stopColor="#f3f3a6" />
        </linearGradient>
        <radialGradient id={`${id}-rim`} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0.68" stopColor="#c8fbff" stopOpacity="0" />
          <stop offset="1" stopColor="#c8fbff" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="0.42" cy="0.55" r="0.45">
          <stop offset="0" stopColor="#c58ce6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#c58ce6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-eye`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#253a8c" />
          <stop offset="1" stopColor="#4a3466" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      <path d={GHOST_A} fill={`url(#${id}-body)`}>
        <animate attributeName="d" values={`${GHOST_A};${GHOST_B};${GHOST_A}`} dur="2.6s" repeatCount="indefinite" />
      </path>
      <path d={GHOST_A} fill={`url(#${id}-glow)`}>
        <animate attributeName="d" values={`${GHOST_A};${GHOST_B};${GHOST_A}`} dur="2.6s" repeatCount="indefinite" />
      </path>
      <path d={GHOST_A} fill={`url(#${id}-rim)`}>
        <animate attributeName="d" values={`${GHOST_A};${GHOST_B};${GHOST_A}`} dur="2.6s" repeatCount="indefinite" />
      </path>
      <ellipse cx="29" cy="21" rx="11" ry="5" fill="#fff" opacity="0.6" transform="rotate(-38 29 21)" filter={`url(#${id}-soft)`} />
      <g ref={eyesRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <ellipse cx="36" cy="44" rx="7.4" ry="11.5" fill={`url(#${id}-eye)`} stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6" />
        <ellipse cx="64" cy="44" rx="7.4" ry="11.5" fill={`url(#${id}-eye)`} stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6" />
      </g>
    </svg>
  );
}

const SKULL =
  "M50 6C75 6 93 24 93 47C93 61 86 71 75 76C72 78 70 81 70 85C70 91 66 94 61 94C56 94 53 91 50 88C47 91 44 94 39 94C34 94 30 91 30 85C30 81 28 78 25 76C14 71 7 61 7 47C7 24 25 6 50 6Z";

export function Skull({ eyesRef, className }: Props) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bone`} x1="0.9" y1="0.05" x2="0.15" y2="0.95">
          <stop offset="0" stopColor="#cfeaff" />
          <stop offset="0.42" stopColor="#d8bdf0" />
          <stop offset="0.72" stopColor="#f2abca" />
          <stop offset="1" stopColor="#f497b0" />
        </linearGradient>
        <radialGradient id={`${id}-shade`} cx="0.3" cy="0.85" r="0.7">
          <stop offset="0" stopColor="#e07a9f" stopOpacity="0.45" />
          <stop offset="1" stopColor="#e07a9f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-socket`} cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" stopColor="#6a52dc" />
          <stop offset="1" stopColor="#2b1f6e" />
        </radialGradient>
        <radialGradient id={`${id}-pupil`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f1ebff" />
          <stop offset="1" stopColor="#b9a8ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <path d={SKULL} fill={`url(#${id}-bone)`} />
      <path d={SKULL} fill={`url(#${id}-shade)`} />
      <ellipse cx="66" cy="20" rx="13" ry="6" fill="#fff" opacity="0.45" transform="rotate(25 66 20)" filter={`url(#${id}-soft)`} />
      <circle cx="33" cy="50" r="13" fill={`url(#${id}-socket)`} />
      <circle cx="67" cy="50" r="13" fill={`url(#${id}-socket)`} />
      <g ref={eyesRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="33" cy="51" r="4.2" fill={`url(#${id}-pupil)`} />
        <circle cx="67" cy="51" r="4.2" fill={`url(#${id}-pupil)`} />
      </g>
      <path d="M50 63C47 63 45.4 65.6 46.2 68.4L50 73L53.8 68.4C54.6 65.6 53 63 50 63Z" fill={`url(#${id}-socket)`} />
    </svg>
  );
}
