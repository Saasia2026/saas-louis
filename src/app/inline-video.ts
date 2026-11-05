// Sur iPhone, certains navigateurs intégrés (celui de TikTok en tête)
// interdisent la lecture dans la page : toute vidéo lancée par script part
// dans le lecteur plein écran du système, playsinline ou pas, et la page n'y
// peut rien. Là, les aperçus restent sur leur image fixe. Un navigateur
// inconnu qui fait pareil est repéré à la première vidéo partie en plein
// écran pendant son démarrage : on l'en sort, et plus rien ne démarre seul.
const IN_APP = /musical_ly|BytedanceWebview|TikTok/i;

let blocked: boolean | null = null;
const starting = new WeakSet<HTMLVideoElement>();

export function inlinePlaybackBlocked() {
  if (blocked === null) {
    const ua = navigator.userAgent;
    blocked = /iPhone|iPad|iPod/.test(ua) && IN_APP.test(ua);
    document.addEventListener(
      "webkitbeginfullscreen",
      (e) => {
        const video = e.target;
        if (!(video instanceof HTMLVideoElement) || !starting.has(video)) return;
        blocked = true;
        (video as HTMLVideoElement & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
        document.querySelectorAll("video:not([controls])").forEach((v) => (v as HTMLVideoElement).pause());
      },
      true,
    );
  }
  return blocked;
}

// play() pour les vidéos que la page lance seule (aperçus, démos, boucles).
export function playInline(video: HTMLVideoElement) {
  if (inlinePlaybackBlocked()) return;
  starting.add(video);
  video
    .play()
    .catch(() => {})
    .finally(() => starting.delete(video));
}
