// Courbe d'intérêt d'une tendance sur la période (valeurs 0 à 100), du violet
// au rose. Le dégradé est le même partout : un identifiant fixe suffit.
export function Sparkline({ values, className = "h-4 w-10" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 40},${14 - (v / 100) * 12}`).join(" ");
  return (
    <svg viewBox="0 0 40 16" aria-hidden className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id="sparkline-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="40" y2="0">
          <stop offset="0" stopColor="var(--accent-light)" />
          <stop offset="1" stopColor="var(--accent-hot)" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="url(#sparkline-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
