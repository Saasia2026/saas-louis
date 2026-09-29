import { useEffect, type RefObject } from "react";

// Deux vidéos du même clip lues ensemble (avant/après). Les fichiers ont le
// même nombre d'images ; la boucle est pilotée ici plutôt que par l'attribut
// loop, pour que les deux repartent au même instant. Un petit écart se
// rattrape en jouant sur la vitesse de la seconde, sans saut visible ; seul
// un grand écart (lecture reprise, onglet revenu) repart par un recalage net.
export function useSyncedPair(
  master: RefObject<HTMLVideoElement | null>,
  follower: RefObject<HTMLVideoElement | null>,
) {
  useEffect(() => {
    const a = master.current;
    const b = follower.current;
    if (!a || !b) return;

    const restart = () => {
      a.currentTime = 0;
      b.currentTime = 0;
      a.play().catch(() => {});
      b.play().catch(() => {});
    };
    a.addEventListener("ended", restart);

    const timer = setInterval(() => {
      if (a.paused) {
        if (!b.paused) b.pause();
        return;
      }
      if (b.paused && !b.ended) b.play().catch(() => {});
      const drift = b.currentTime - a.currentTime;
      if (Math.abs(drift) > 0.4) {
        b.currentTime = a.currentTime;
        b.playbackRate = 1;
      } else {
        b.playbackRate = drift > 0.03 ? 0.95 : drift < -0.03 ? 1.05 : 1;
      }
    }, 250);

    return () => {
      a.removeEventListener("ended", restart);
      clearInterval(timer);
    };
  }, [master, follower]);
}
