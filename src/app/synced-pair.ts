import { useEffect, type RefObject } from "react";

// Deux vidéos du même clip lues ensemble (avant/après), avec le même nombre
// d'images. La première mène, la seconde suit : elle démarre, s'arrête et
// reprend avec elle, toujours recalée sur son temps. Si l'une attend ses
// données, l'autre l'attend aussi, sinon l'écart se creuse. La boucle est
// pilotée ici plutôt que par l'attribut loop, pour repartir ensemble.
export function useSyncedPair(
  master: RefObject<HTMLVideoElement | null>,
  follower: RefObject<HTMLVideoElement | null>,
) {
  useEffect(() => {
    const a = master.current;
    const b = follower.current;
    if (!a || !b) return;

    // La meneuse mise en pause parce que la suiveuse chargeait.
    let heldForFollower = false;

    const align = () => {
      if (Math.abs(b.currentTime - a.currentTime) > 0.05) b.currentTime = a.currentTime;
      b.playbackRate = 1;
    };
    const follow = () => {
      align();
      if (b.paused) b.play().catch(() => {});
    };

    const onMasterPlaying = () => follow();
    const onMasterPause = () => {
      if (!heldForFollower) b.pause();
    };
    const onMasterWaiting = () => b.pause();
    const onMasterEnded = () => {
      a.currentTime = 0;
      b.currentTime = 0;
      a.play().catch(() => {});
    };
    const onFollowerWaiting = () => {
      if (a.paused) return;
      heldForFollower = true;
      a.pause();
    };
    const onFollowerReady = () => {
      if (!heldForFollower) return;
      heldForFollower = false;
      align();
      a.play().catch(() => {});
    };
    // La suiveuse lancée seule (retour à l'écran) se recale sur la meneuse.
    const onFollowerPlay = () => {
      if (a.paused && !heldForFollower) b.pause();
      else align();
    };

    a.addEventListener("playing", onMasterPlaying);
    a.addEventListener("pause", onMasterPause);
    a.addEventListener("waiting", onMasterWaiting);
    a.addEventListener("ended", onMasterEnded);
    b.addEventListener("waiting", onFollowerWaiting);
    b.addEventListener("canplay", onFollowerReady);
    b.addEventListener("play", onFollowerPlay);

    // Petit écart : rattrapé par la vitesse, sans saut visible. Grand écart :
    // recalage net (rapide, les fichiers ont une image clé par demi-seconde).
    const timer = setInterval(() => {
      if (a.paused || b.paused || b.seeking) return;
      const drift = b.currentTime - a.currentTime;
      if (Math.abs(drift) > 0.3) align();
      else b.playbackRate = drift > 0.03 ? 0.95 : drift < -0.03 ? 1.05 : 1;
    }, 250);

    return () => {
      a.removeEventListener("playing", onMasterPlaying);
      a.removeEventListener("pause", onMasterPause);
      a.removeEventListener("waiting", onMasterWaiting);
      a.removeEventListener("ended", onMasterEnded);
      b.removeEventListener("waiting", onFollowerWaiting);
      b.removeEventListener("canplay", onFollowerReady);
      b.removeEventListener("play", onFollowerPlay);
      clearInterval(timer);
    };
  }, [master, follower]);
}
