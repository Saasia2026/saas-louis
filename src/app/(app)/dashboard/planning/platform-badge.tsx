import { Camera, Music2, Play, type LucideIcon } from "lucide-react";
import type { SocialPlatform } from "@/lib/zernio";

const STYLE: Record<SocialPlatform, { icon?: LucideIcon; letter?: string; background: string }> = {
  tiktok: { icon: Music2, background: "#111" },
  instagram: { icon: Camera, background: "linear-gradient(135deg, #f58529, #dd2a7b 55%, #8134af)" },
  youtube: { icon: Play, background: "#ff0033" },
  facebook: { letter: "f", background: "#1877f2" },
};

// Pastille de couleur du réseau (les logos des marques ne sont pas fournis
// par la bibliothèque d'icônes).
export function PlatformBadge({ platform, className = "size-8" }: { platform: SocialPlatform; className?: string }) {
  const { icon: Icon, letter, background } = STYLE[platform];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-lg text-white ring-1 ring-white/15 ${className}`}
      style={{ background }}
    >
      {Icon ? <Icon className="size-[55%]" fill={platform === "youtube" ? "currentColor" : "none"} /> : null}
      {letter ? <span className="text-[0.95em] leading-none font-black">{letter}</span> : null}
    </span>
  );
}
