import Link from "next/link";

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 ${className}`}>
      <span aria-hidden className="size-2.5 rounded-[3px] bg-accent shadow-[0_0_12px_var(--accent)]" />
      <span className="font-wide text-[0.95rem] uppercase tracking-tight">TwinPost</span>
    </Link>
  );
}
