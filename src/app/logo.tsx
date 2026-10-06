import Link from "next/link";
import { LogoMark } from "./logo-mark";

export function Logo({
  href = "/",
  className = "",
  compact = false,
}: {
  href?: string;
  className?: string;
  // Barre chargée : le nom n'apparaît qu'à partir des écrans moyens.
  compact?: boolean;
}) {
  return (
    <Link href={href} aria-label="TwinPost" className={`group inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-8 shrink-0" />
      <span
        className={`hidden font-wide text-[0.95rem] uppercase tracking-tight ${
          compact ? "sm:inline" : "min-[360px]:inline"
        }`}
      >
        TwinPost
      </span>
    </Link>
  );
}
