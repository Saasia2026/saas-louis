"use client";

import type { LucideIcon } from "lucide-react";
import { PlayerBar, usePlayer } from "@/app/video-player";
import type { AspectRatio } from "@/lib/generation";

// Taille du cadre : les formats verticaux suivent la hauteur de l'écran, le
// 16:9 la largeur du panneau.
const FRAME: Record<AspectRatio, { className: string; height?: string }> = {
  "9:16": { className: "max-w-full", height: "min(72vh, 42rem)" },
  "1:1": { className: "max-w-full", height: "min(62vh, 34rem)" },
  "16:9": { className: "w-full max-w-3xl" },
};

// Scène du rendu : le même cadre porte l'attente puis la vidéo finie, qui
// apparaît en fondu par-dessus le clip d'origine tamisé. Lecteur maison sous
// le cadre (rien ne recouvre l'image), actions sur le bord droit.
export function ResultStage({
  aspectRatio,
  mediaUrl,
  backdrop,
  overlay,
  actions,
}: {
  aspectRatio: AspectRatio;
  mediaUrl?: string;
  backdrop?: string;
  overlay?: React.ReactNode;
  // Boutons ronds sur le bord droit (facultatif : la scène du studio a ses
  // actions dans sa colonne).
  actions?: React.ReactNode;
}) {
  const player = usePlayer();
  const frame = FRAME[aspectRatio];

  return (
    <>
      <div className={`relative flex flex-col items-center gap-3 px-4 pt-6 pb-6 ${actions ? "sm:px-20" : "sm:px-6"}`}>

        <div
          className={`relative flex items-center justify-center overflow-hidden rounded-3xl bg-black ${frame.className}`}
          style={{
            aspectRatio: aspectRatio.replace(":", " / "),
            height: frame.height,
            boxShadow: "0 0 0 1px rgb(255 255 255 / 0.18), 0 40px 80px -30px rgb(0 0 0 / 0.75)",
          }}
        >
          {backdrop && !player.ready && (
            <video
              src={backdrop}
              muted
              loop
              autoPlay
              playsInline
              webkit-playsinline=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full object-cover opacity-30"
            />
          )}
          {mediaUrl ? (
            <video
              src={mediaUrl}
              autoPlay
              loop
              playsInline
              webkit-playsinline=""
              {...player.videoProps}
              className={`absolute inset-0 size-full cursor-pointer object-contain transition-opacity duration-500 ${
                player.ready ? "opacity-100" : "opacity-0"
              }`}
            />
          ) : (
            overlay
          )}
          {/* Barre de lecture posée en bas de l'image. */}
          {mediaUrl && player.ready && <PlayerBar player={player} overlay />}
        </div>

        {actions && <div className="flex gap-2 sm:absolute sm:top-5 sm:right-4 sm:flex-col">{actions}</div>}
      </div>

    </>
  );
}

// Bouton rond de la colonne d'actions : lien (téléchargement) ou action.
export function StageAction({
  icon: Icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const className =
    "flex size-10 items-center justify-center rounded-full bg-surface-3 text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-text disabled:opacity-50";
  const icon = <Icon className="size-[1.125rem]" />;
  return href ? (
    <a href={href} aria-label={label} title={label} className={className}>
      {icon}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={className}>
      {icon}
    </button>
  );
}
