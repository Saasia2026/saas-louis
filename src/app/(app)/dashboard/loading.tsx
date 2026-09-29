// Réponse immédiate au clic de navigation : ce squelette s'affiche pendant
// que la page (auth + données Supabase) se prépare côté serveur — sans lui,
// le clic semble ignoré une demi-seconde.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8 pt-2" aria-busy>
      <div className="border-b border-line pb-8">
        <span className="block h-3 w-24 animate-pulse rounded bg-surface-3" />
        <span className="mt-5 block h-9 w-64 animate-pulse rounded bg-surface-3" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-44 animate-pulse rounded-xl border border-line bg-surface-2"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
