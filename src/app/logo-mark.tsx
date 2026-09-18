"use client";

import { useId } from "react";

// Emblème TwinPost : un T formé d'une barre et d'une pointe arrondie, en
// dégradé cyan → bleu → violet avec un halo néon. Tracé en SVG (100 × 100)
// pour rester net à toutes les tailles. `animated` : apparition, dégradé qui
// ondule, halo qui respire et reflet qui balaie (voir globals.css).
export function LogoMark({
  className = "",
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fill = `logo-fill-${id}`;
  const gloss = `logo-gloss-${id}`;
  const shine = `logo-shine-${id}`;
  const clip = `logo-clip-${id}`;

  const bar = { x: 18, y: 23, width: 64, height: 16, rx: 8 };
  // Les coins de la pointe sont arrondis par un trait épais à jointure ronde.
  const tip = "39,49 62,49 41,72";

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={`logo-mark ${animated ? "logo-animated" : ""} ${className}`}
    >
      <defs>
        <linearGradient id={fill} gradientUnits="userSpaceOnUse" x1="14" y1="18" x2="78" y2="82">
          <stop offset="0" stopColor="#8ef0ff" />
          <stop offset="0.45" stopColor="#5b7cff" />
          <stop offset="1" stopColor="#8b3dff" />
          {animated && (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              values="0 50 50; 28 50 50; 0 50 50"
              dur="7s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <rect {...bar} />
          <polygon points={tip} stroke="#000" strokeWidth="8" strokeLinejoin="round" />
        </clipPath>
      </defs>

      <rect className="logo-bar" {...bar} fill={`url(#${fill})`} />
      <polygon
        className="logo-tip"
        points={tip}
        fill={`url(#${fill})`}
        stroke={`url(#${fill})`}
        strokeWidth="8"
        strokeLinejoin="round"
      />

      <g clipPath={`url(#${clip})`}>
        {/* Reflet vitré sur le haut des formes. */}
        <rect x="0" y="23" width="100" height="10" fill={`url(#${gloss})`} />
        <rect x="0" y="45" width="100" height="14" fill={`url(#${gloss})`} />
        {animated && (
          <rect
            className="logo-shine"
            x="-45"
            y="0"
            width="26"
            height="100"
            fill={`url(#${shine})`}
            transform="skewX(-18)"
          />
        )}
      </g>
    </svg>
  );
}
