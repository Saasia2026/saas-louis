// Courbe d'intérêt d'une tendance sur la période (valeurs 0 à 100).
export function Sparkline({ values, className = "h-4 w-10" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 40},${14 - (v / 100) * 12}`).join(" ");
  return (
    <svg viewBox="0 0 40 16" aria-hidden className={`shrink-0 text-accent-light ${className}`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
