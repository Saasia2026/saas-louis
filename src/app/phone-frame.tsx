// iPhone 18 Pro dessiné en CSS : écran 1206 × 2622, bordures fines (~1,2 mm),
// Dynamic Island réduite d'un tiers, boutons du modèle Pro (Action, volume,
// latéral, Commande de l'appareil photo). La vidéo occupe tout l'écran, barre
// d'état et barre d'accueil par-dessus, comme une vidéo ouverte en plein écran.
export function PhoneFrame({
  children,
  ambient,
  className = "",
}: {
  children: React.ReactNode;
  // Affiche floutée derrière le téléphone, en lumière d'ambiance.
  ambient?: string;
  className?: string;
}) {
  const button = "absolute w-[3px] bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-500";
  return (
    <div className={`relative isolate ${className}`}>
      {ambient && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ambient} alt="" aria-hidden className="ambient" />
      )}
      {/* Gauche : bouton Action, volume + et -. Droite : bouton latéral et
          Commande de l'appareil photo, presque à fleur. */}
      <span aria-hidden className={`${button} top-[16%] -left-[3px] h-[5%] rounded-l-sm`} />
      <span aria-hidden className={`${button} top-[24%] -left-[3px] h-[8%] rounded-l-sm`} />
      <span aria-hidden className={`${button} top-[34%] -left-[3px] h-[8%] rounded-l-sm`} />
      <span aria-hidden className={`${button} top-[27%] -right-[3px] h-[11%] rounded-r-sm`} />
      <span
        aria-hidden
        className="absolute top-[57%] -right-[2px] h-[8%] w-[2px] rounded-r-sm bg-gradient-to-r from-zinc-600 to-zinc-800"
      />

      <div className="rounded-[15%/7%] bg-gradient-to-br from-zinc-300 via-zinc-500 to-zinc-400 p-[2.5px] shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)]">
        <div className="rounded-[14.5%/6.7%] bg-black p-[1.7%]">
          <div
            className="relative overflow-hidden rounded-[13%/6%] bg-black"
            style={{ aspectRatio: "1206 / 2622" }}
          >
            <div className="absolute inset-0">{children}</div>

            {/* Barre d'état, alignée sur la Dynamic Island. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-[1.4%] z-20 flex h-[4.1%] items-center justify-between px-[7.5%] text-[0.8125rem] font-semibold text-white [text-shadow:0_0_6px_rgb(0_0_0/0.25)]"
              style={{ fontFamily: '-apple-system, "SF Pro Text", var(--font-sans)' }}
            >
              <span className="w-[26%] text-center tabular-nums">9:41</span>
              <span className="flex w-[26%] items-center justify-center gap-[5px]">
                <svg viewBox="0 0 18 12" className="h-[0.6875rem] w-auto fill-current">
                  <rect x="0" y="8" width="3" height="4" rx="0.8" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
                  <rect x="10" y="3" width="3" height="9" rx="0.8" />
                  <rect x="15" y="0" width="3" height="12" rx="0.8" />
                </svg>
                <svg viewBox="0 0 16 12" className="h-[0.6875rem] w-auto fill-current">
                  <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .6 10.4 10.4 0 0 0 .8 3.5L2 4.8a8.6 8.6 0 0 1 6-2.4Z" />
                  <path d="M8 5.9c1.3 0 2.5.5 3.5 1.3l1.2-1.3A7 7 0 0 0 8 4.1a7 7 0 0 0-4.7 1.8l1.2 1.3c1-.8 2.2-1.3 3.5-1.3Z" />
                  <path d="M8 9.3c.4 0 .8.1 1.1.4L8 11.4 6.9 9.7c.3-.3.7-.4 1.1-.4Z" />
                </svg>
                <svg viewBox="0 0 27 13" className="h-[0.75rem] w-auto">
                  <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" strokeOpacity="0.4" />
                  <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
                  <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" fillOpacity="0.45" />
                </svg>
              </span>
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute top-[1.4%] left-1/2 z-20 h-[4.1%] w-[21%] -translate-x-1/2 rounded-full bg-black"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-[0.9%] left-1/2 z-20 h-[0.6%] min-h-[4px] w-[33%] -translate-x-1/2 rounded-full bg-white/85"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
