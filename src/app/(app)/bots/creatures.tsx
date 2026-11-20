"use client";

import { useId, type Ref } from "react";

// Les deux créatures, dessinées en SVG pour être animées : le fantôme irisé
// (Scout) et la tête de mort pastel (Hook). Les yeux sont un groupe à part,
// que l'aquarium déplace (regard) et écrase (clignement) à chaque image.
//
// Le volume vient de trois couches : un filtre d'éclairage (relief bombé tiré
// de la silhouette floutée, ombre sur le côté opposé à la lumière), des
// dégradés d'ombrage (bords et bas plus sombres, liseré clair à contre-jour)
// et des reflets nets posés par-dessus. La lumière vient d'en haut à gauche
// pour le fantôme, d'en haut à droite pour la tête de mort, comme sur les
// modèles.

type Props = { eyesRef?: Ref<SVGGElement>; className?: string };

// Relief : la silhouette floutée sert de carte de hauteur. Lumière diffuse
// (ombre propre) puis reflet spéculaire, limités à la silhouette.
function Puff({ id, light, azimuth }: { id: string; light: [number, number]; azimuth: number }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="height" />
      <feDiffuseLighting in="height" surfaceScale="6" diffuseConstant="1" lightingColor="#ffffff" result="diffuse">
        <feDistantLight azimuth={azimuth} elevation="48" />
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="diffuse" operator="arithmetic" k1="0.55" k2="0.5" result="lit" />
      <feSpecularLighting
        in="height"
        surfaceScale="6"
        specularConstant="0.5"
        specularExponent="30"
        lightingColor="#ffffff"
        result="spec"
      >
        <fePointLight x={light[0]} y={light[1]} z="80" />
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
      <feComposite in="lit" in2="specIn" operator="arithmetic" k2="1" k3="0.35" />
    </filter>
  );
}

// Bas du fantôme : trois lobes, en deux positions pour l'ondulation.
const GHOST_A =
  "M50 4C24 4 8 22 8 50L8 86C8 98 12 105 19 105C25 105 27 97 32 97C38 97 42 107 50 107C58 107 62 97 68 97C73 97 75 105 81 105C88 105 92 98 92 86L92 50C92 22 76 4 50 4Z";
const GHOST_B =
  "M50 4C24 4 8 22 8 50L8 87C8 96 13 101 19 101C26 101 27 99 32 99C38 99 42 110 50 110C58 110 62 99 68 99C73 99 74 101 81 101C87 101 92 96 92 87L92 50C92 22 76 4 50 4Z";

function GhostShape({ fill }: { fill: string }) {
  return (
    <path d={GHOST_A} fill={fill}>
      <animate attributeName="d" values={`${GHOST_A};${GHOST_B};${GHOST_A}`} dur="2.6s" repeatCount="indefinite" />
    </path>
  );
}

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
        {/* Ombrage de sphère : clair près de la lumière, sombre sur les bords. */}
        <radialGradient id={`${id}-shade`} cx="0.36" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.8" stopColor="#3d2a7a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#2b1b5c" stopOpacity="0.42" />
        </radialGradient>
        <linearGradient id={`${id}-base`} x1="0" y1="0.55" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2470" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2470" stopOpacity="0.3" />
        </linearGradient>
        {/* Liseré clair à contre-jour, côté opposé à la lumière. */}
        <radialGradient id={`${id}-rim`} cx="0.4" cy="0.36" r="0.7">
          <stop offset="0.8" stopColor="#d4fbff" stopOpacity="0" />
          <stop offset="1" stopColor="#d4fbff" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="0.42" cy="0.55" r="0.45">
          <stop offset="0" stopColor="#c58ce6" stopOpacity="0.5" />
          <stop offset="1" stopColor="#c58ce6" stopOpacity="0" />
        </radialGradient>
        {/* Yeux en perles : sombres en haut, lumière renvoyée en bas. */}
        <radialGradient id={`${id}-eye`} cx="0.45" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#2f47a8" />
          <stop offset="0.65" stopColor="#1d2466" />
          <stop offset="1" stopColor="#3e2c6e" />
        </radialGradient>
        <linearGradient id={`${id}-eyeBounce`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#9fc4ff" stopOpacity="0" />
          <stop offset="1" stopColor="#9fc4ff" stopOpacity="0.55" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id={`${id}-crisp`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <filter id={`${id}-socket`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <Puff id={`${id}-puff`} light={[22, 4]} azimuth={225} />
      </defs>
      <g filter={`url(#${id}-puff)`}>
        <GhostShape fill={`url(#${id}-body)`} />
        <GhostShape fill={`url(#${id}-glow)`} />
        <GhostShape fill={`url(#${id}-shade)`} />
        <GhostShape fill={`url(#${id}-base)`} />
        <GhostShape fill={`url(#${id}-rim)`} />
      </g>
      {/* Reflets : un large et doux, un petit et net. */}
      <ellipse cx="29" cy="22" rx="12" ry="5.5" fill="#fff" opacity="0.55" transform="rotate(-38 29 22)" filter={`url(#${id}-soft)`} />
      <ellipse cx="25.5" cy="24" rx="4.6" ry="2.2" fill="#fff" opacity="0.95" transform="rotate(-42 25.5 24)" filter={`url(#${id}-crisp)`} />
      <circle cx="17.5" cy="35" r="1.5" fill="#fff" opacity="0.75" />
      <g ref={eyesRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        {/* Creux autour des yeux, pour qu'ils paraissent enfoncés. */}
        <ellipse cx="36" cy="45.5" rx="8.6" ry="12.6" fill="#5a3f8f" opacity="0.35" filter={`url(#${id}-socket)`} />
        <ellipse cx="64" cy="45.5" rx="8.6" ry="12.6" fill="#5a3f8f" opacity="0.35" filter={`url(#${id}-socket)`} />
        <ellipse cx="36" cy="44" rx="7.4" ry="11.5" fill={`url(#${id}-eye)`} />
        <ellipse cx="64" cy="44" rx="7.4" ry="11.5" fill={`url(#${id}-eye)`} />
        <ellipse cx="36" cy="44" rx="7.4" ry="11.5" fill={`url(#${id}-eyeBounce)`} />
        <ellipse cx="64" cy="44" rx="7.4" ry="11.5" fill={`url(#${id}-eyeBounce)`} />
        <ellipse cx="33.4" cy="38" rx="2.3" ry="3.4" fill="#fff" opacity="0.92" transform="rotate(-18 33.4 38)" />
        <ellipse cx="61.4" cy="38" rx="2.3" ry="3.4" fill="#fff" opacity="0.92" transform="rotate(-18 61.4 38)" />
        <circle cx="38.6" cy="51" r="1" fill="#fff" opacity="0.6" />
        <circle cx="66.6" cy="51" r="1" fill="#fff" opacity="0.6" />
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
          <stop offset="0" stopColor="#e07a9f" stopOpacity="0.4" />
          <stop offset="1" stopColor="#e07a9f" stopOpacity="0" />
        </radialGradient>
        {/* Ombrage de sphère, lumière en haut à droite. */}
        <radialGradient id={`${id}-sphere`} cx="0.64" cy="0.26" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.8" stopColor="#6a2f6e" stopOpacity="0.14" />
          <stop offset="1" stopColor="#4a1f55" stopOpacity="0.4" />
        </radialGradient>
        {/* Mâchoire en retrait, plus sombre. */}
        <linearGradient id={`${id}-jaw`} x1="0" y1="0.68" x2="0" y2="1">
          <stop offset="0" stopColor="#7a2d5e" stopOpacity="0" />
          <stop offset="1" stopColor="#7a2d5e" stopOpacity="0.32" />
        </linearGradient>
        <radialGradient id={`${id}-rim`} cx="0.58" cy="0.34" r="0.7">
          <stop offset="0.82" stopColor="#ffe3f0" stopOpacity="0" />
          <stop offset="1" stopColor="#ffe3f0" stopOpacity="0.7" />
        </radialGradient>
        {/* Orbites creusées : l'arcade fait de l'ombre en haut. */}
        <linearGradient id={`${id}-socket`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#140d40" />
          <stop offset="0.6" stopColor="#3a2a9a" />
          <stop offset="1" stopColor="#6a52dc" />
        </linearGradient>
        <radialGradient id={`${id}-pupil`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f1ebff" />
          <stop offset="1" stopColor="#b9a8ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={`${id}-crisp`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <Puff id={`${id}-puff`} light={[78, 4]} azimuth={315} />
      </defs>
      <g filter={`url(#${id}-puff)`}>
        <path d={SKULL} fill={`url(#${id}-bone)`} />
        <path d={SKULL} fill={`url(#${id}-shade)`} />
        <path d={SKULL} fill={`url(#${id}-sphere)`} />
        <path d={SKULL} fill={`url(#${id}-jaw)`} />
        <path d={SKULL} fill={`url(#${id}-rim)`} />
      </g>
      {/* Reflets du crâne. */}
      <ellipse cx="66" cy="20" rx="13" ry="6" fill="#fff" opacity="0.45" transform="rotate(25 66 20)" filter={`url(#${id}-soft)`} />
      <ellipse cx="70" cy="16.5" rx="5" ry="2.3" fill="#fff" opacity="0.95" transform="rotate(28 70 16.5)" filter={`url(#${id}-crisp)`} />
      <circle cx="80.5" cy="26" r="1.5" fill="#fff" opacity="0.75" />
      {/* Orbites et bord inférieur éclairé. */}
      <circle cx="33" cy="50" r="13" fill={`url(#${id}-socket)`} />
      <circle cx="67" cy="50" r="13" fill={`url(#${id}-socket)`} />
      <path d="M21.5 56A13 13 0 0 0 44.5 56" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" filter={`url(#${id}-crisp)`} />
      <path d="M55.5 56A13 13 0 0 0 78.5 56" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" filter={`url(#${id}-crisp)`} />
      <g ref={eyesRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="33" cy="51" r="6.5" fill="#b9a8ff" opacity="0.45" filter={`url(#${id}-glow)`} />
        <circle cx="67" cy="51" r="6.5" fill="#b9a8ff" opacity="0.45" filter={`url(#${id}-glow)`} />
        <circle cx="33" cy="51" r="4.2" fill={`url(#${id}-pupil)`} />
        <circle cx="67" cy="51" r="4.2" fill={`url(#${id}-pupil)`} />
      </g>
      <path d="M50 63C47 63 45.4 65.6 46.2 68.4L50 73L53.8 68.4C54.6 65.6 53 63 50 63Z" fill={`url(#${id}-socket)`} />
      <path d="M46.6 69.2L50 73L53.4 69.2" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
