import { BatteryFull, SignalHigh, Wifi } from "lucide-react";

// Téléphone dessiné en CSS (contour métal, écran noir, Dynamic Island, barre
// d'état et barre d'accueil) : la vidéo 9:16 se joue au milieu de l'écran,
// plus haut qu'elle, comme une vidéo ouverte sur un vrai téléphone.
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
  return (
    <div className={`relative isolate ${className}`}>
      {ambient && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ambient} alt="" aria-hidden className="ambient" />
      )}
      {/* Boutons latéraux. */}
      <span aria-hidden className="absolute top-[17%] -left-[3px] h-7 w-[3px] rounded-l-sm bg-zinc-500" />
      <span aria-hidden className="absolute top-[25%] -left-[3px] h-12 w-[3px] rounded-l-sm bg-zinc-500" />
      <span aria-hidden className="absolute top-[34%] -left-[3px] h-12 w-[3px] rounded-l-sm bg-zinc-500" />
      <span aria-hidden className="absolute top-[28%] -right-[3px] h-16 w-[3px] rounded-r-sm bg-zinc-500" />

      <div className="rounded-[3rem] bg-gradient-to-b from-zinc-400 via-zinc-600 to-zinc-500 p-[3px] shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)]">
        <div className="rounded-[2.85rem] bg-black p-[9px]">
          <div
            className="relative flex items-center overflow-hidden rounded-[2.35rem] bg-[#0c0c0e]"
            style={{ aspectRatio: "9 / 19.5" }}
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-[9%] pt-[4.5%] text-[0.8rem] font-semibold text-white"
            >
              <span className="tabular-nums">9:41</span>
              <span className="flex items-center gap-1">
                <SignalHigh className="size-3.5" />
                <Wifi className="size-3.5" />
                <BatteryFull className="size-4" />
              </span>
            </div>
            <span
              aria-hidden
              className="absolute top-[2.2%] left-1/2 z-10 h-[3.6%] w-[31%] -translate-x-1/2 rounded-full bg-black"
            />
            <div className="w-full">{children}</div>
            <span
              aria-hidden
              className="absolute bottom-[1.6%] left-1/2 h-[4px] w-[34%] -translate-x-1/2 rounded-full bg-white/80"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
