import Link from "next/link";

// Logo du site : le nom seul, en capitales larges et blanches, comme dans le
// menu latéral et sur la landing. Plus de pictogramme.
export function Logo({
  href = "/",
  className = "",
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="TwinPost"
      className={`inline-flex items-center text-white uppercase ${className}`}
      style={{
        fontFamily: 'var(--font-archivo), "Helvetica Neue", Arial, sans-serif',
        fontWeight: 900,
        fontStretch: "125%",
        fontSize: "1rem",
        letterSpacing: "0.02em",
      }}
    >
      TwinPost
    </Link>
  );
}
