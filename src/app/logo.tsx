import { Play } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_18px_-2px_var(--accent)] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105"
      >
        <Play className="size-3.5 translate-x-px fill-white text-white" />
      </span>
      <span className="font-wide text-[0.95rem] uppercase tracking-tight">TwinPost</span>
    </Link>
  );
}
