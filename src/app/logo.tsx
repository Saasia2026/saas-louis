import Link from "next/link";
import { LogoMark } from "./logo-mark";

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-8" />
      <span className="font-wide text-[0.95rem] uppercase tracking-tight">TwinPost</span>
    </Link>
  );
}
