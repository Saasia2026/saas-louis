"use client";

import { Bookmark, Heart, Send, type LucideIcon } from "lucide-react";
import { useRef } from "react";

function RailButton({
  icon: Icon,
  label,
  pressed,
  pressedClass = "",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
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
          className={`size-8 drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] transition-colors ${pressed ? pressedClass : ""}`}
          fill={pressed ? "currentColor" : "none"}
          strokeWidth={pressed ? 1.5 : 2}
        />
      </span>
      <span className="text-[11px] leading-tight font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">{label}</span>
    </button>
  );
}

// Rail d'actions à droite, comme sur TikTok. Pas de compteurs tant qu'il
// n'existe pas de vrais chiffres (la phase « feed_items » les apportera) :
// mieux vaut rien qu'un nombre inventé.
export function FeedRail({
  liked,
  saved,
  labels,
  onLike,
  onSave,
  onShare,
  className = "",
}: {
  liked: boolean;
  saved: boolean;
  labels: { like: string; save: string; share: string };
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-5 ${className}`}>
      <RailButton icon={Heart} label={labels.like} pressed={liked} pressedClass="text-rose-500" onClick={onLike} />
      <RailButton icon={Bookmark} label={labels.save} pressed={saved} pressedClass="text-amber-400" onClick={onSave} />
      <RailButton icon={Send} label={labels.share} onClick={onShare} />
    </div>
  );
}
