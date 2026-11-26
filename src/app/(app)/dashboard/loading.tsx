// Réponse immédiate au clic de navigation : ce squelette s'affiche pendant
// que la page (auth + données Supabase) se prépare côté serveur — sans lui,
// le clic semble ignoré une demi-seconde. Au style du site : un trait blanc
// qui court en haut, le titre centré et une grande carte en verre.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center gap-8 pt-6" aria-busy>
      <span className="relative block h-px w-40 overflow-hidden bg-white/15">
        <span
          className="absolute inset-y-0 left-0 w-1/3 bg-brand"
          style={{ animation: "loading-run 1.4s cubic-bezier(0.77, 0, 0.18, 1) infinite" }}
        />
      </span>
      <div className="flex flex-col items-center gap-3">
        <span className="block h-3 w-28 animate-pulse rounded-full bg-white/10" />
        <span className="block h-10 w-72 max-w-full animate-pulse rounded-full bg-white/10 sm:w-96" />
      </div>
      <span
        className="block h-80 w-full max-w-4xl animate-pulse rounded-3xl border border-white/10 bg-white/5"
        style={{ animationDelay: "120ms" }}
      />
      <style>{`@keyframes loading-run { from { transform: translateX(-100%); } to { transform: translateX(300%); } }`}</style>
    </div>
  );
}
