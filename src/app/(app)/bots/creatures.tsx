"use client";

import type { Ref } from "react";

// Les deux bots sont des bulles vidéo : un rond qui joue un rendu Shinka en
// boucle, avec deux yeux par-dessus. Contour blanc pour Scout, blanc voilé pour
// Hook. Les vidéos sont les versions légères du mur (public/demos/wall :
// 320 px, sans son, ~150 ko).
//
// Les yeux sont un groupe SVG à part, que l'aquarium déplace (regard) et
// écrase (clignement) à chaque image ; les déplacements sont en unités du
// dessin (100 de large).
//
// `talking` : le bot parle (sa petite bulle est ouverte), il hoche la tête.
// `still` : image fixe au lieu de la vidéo, pour les petits avatars répétés
// (messages de la discussion, bouton d'activation).

type Props = { eyesRef?: Ref<SVGGElement>; className?: string; talking?: boolean; still?: boolean };

const wall = (n: string) => `/demos/wall/demo-${n}`;

// Vidéo jouée par chaque bot (sans extension) : bulle et en-tête de sa fenêtre.
export const BOT_VIDEO = { scout: wall("17"), hook: wall("19") } as const;

function Bubble({ src, ring, eyesRef, className, talking, still }: Props & { src: string; ring: string }) {
  return (
    <span
      className={`relative block overflow-hidden rounded-full bg-[#222] ${className ?? ""}`}
      style={{ animation: talking ? "bot-nod 0.5s ease-in-out 3" : undefined }}
    >
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${src}.jpg`} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <video
          src={`${src}.mp4`}
          poster={`${src}.jpg`}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id="bot-veil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.32" />
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bot-veil)" />
        {/* Contour, dessiné par-dessus la vidéo pour rester net à toutes les tailles. */}
        <circle cx="50" cy="50" r="47.5" fill="none" stroke={ring} strokeWidth="5" />
        <g ref={eyesRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <ellipse cx="37" cy="37" rx="10.5" ry="12.5" fill="#fff" />
          <ellipse cx="63" cy="37" rx="10.5" ry="12.5" fill="#fff" />
          <ellipse cx="38.5" cy="38" rx="5.4" ry="6" fill="#0c0c10" />
          <ellipse cx="64.5" cy="38" rx="5.4" ry="6" fill="#0c0c10" />
        </g>
      </svg>
    </span>
  );
}

export function ScoutFace(props: Props) {
  return <Bubble {...props} src={BOT_VIDEO.scout} ring="#ffffff" />;
}

export function HookFace(props: Props) {
  return <Bubble {...props} src={BOT_VIDEO.hook} ring="rgb(255 255 255 / 0.45)" />;
}
