"use client";
/* eslint-disable @next/next/no-img-element -- avatar venu d'un autre site */

import { Bookmark, Heart, Repeat2, Send, type LucideIcon } from "lucide-react";
import { useRef } from "react";

const SHADOW = "drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]";
const TEXT = "text-[11px] leading-tight font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]";

function RailButton({
  icon: Icon,
  label,
  count,
  pressed,
  pressedClass = "",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  // Affiché à la place du libellé dès qu'il existe un vrai chiffre.
  count?: string;
  pressed?: boolean;
  pressedClass?: string;
  onClick: () => void;
}) {
  const icon = useRef<HTMLSpanElement>(null);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={() => {
        // Petit rebond quand on active (pas quand on retire).
        if (!pressed) {
          icon.current?.animate(
            [{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }],
            { duration: 320, easing: "ease-out" },
          );
        }
        onClick();
      }}
      className="pointer-events-auto flex w-14 flex-col items-center gap-1 text-white"
    >
      <span ref={icon} className="flex">
        <Icon
          className={`size-8 ${SHADOW} transition-colors ${pressed ? pressedClass : ""}`}
          fill={pressed ? "currentColor" : "none"}
          strokeWidth={pressed ? 1.5 : 2}
        />
      </span>
      <span className={TEXT}>{count ?? label}</span>
    </button>
  );
}

export type RailLabels = {
  like: string;
  save: string;
  share: string;
  recreations: string;
  profile: string;
};

// Rail d'actions à droite, comme sur TikTok. Les chiffres ne s'affichent que
// s'ils existent vraiment (j'aime et recréations des comptes) : mieux vaut un
// libellé qu'un nombre inventé.
export function FeedRail({
  creator,
  liked,
  saved,
  likes,
  recreations,
  labels,
  format,
  onLike,
  onSave,
  onShare,
  className = "",
}: {
  creator: { handle: string; url: string | null; avatarUrl: string | null } | null;
  liked: boolean;
  saved: boolean;
  likes: number;
  recreations: number;
  labels: RailLabels;
  format: (n: number) => string;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  className?: string;
}) {
  const avatar = creator && (
    <span className="flex size-12 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-neutral-800 text-lg font-bold text-white uppercase">
      {creator.avatarUrl ? (
        <img src={creator.avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        creator.handle.replace(/^@/, "").charAt(0)
      )}
    </span>
  );
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-5 ${className}`}>
      {creator &&
        (creator.url ? (
          <a
            href={creator.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={labels.profile.replace("{handle}", creator.handle)}
            className={`pointer-events-auto ${SHADOW}`}
          >
            {avatar}
          </a>
        ) : (
          <span className={SHADOW}>{avatar}</span>
        ))}
      <RailButton
        icon={Heart}
        label={labels.like}
        count={likes > 0 ? format(likes) : undefined}
        pressed={liked}
        pressedClass="text-rose-500"
        onClick={onLike}
      />
      <RailButton icon={Bookmark} label={labels.save} pressed={saved} pressedClass="text-amber-400" onClick={onSave} />
      <RailButton icon={Send} label={labels.share} onClick={onShare} />
      {recreations > 0 && (
        <span className="flex w-14 flex-col items-center gap-1 text-white">
          <Repeat2 aria-hidden className={`size-8 ${SHADOW}`} />
          <span className={TEXT}>
            <span className="sr-only">{labels.recreations} : </span>
            {format(recreations)}
          </span>
        </span>
      )}
    </div>
  );
}
