import { useEffect, type RefObject } from "react";

// Ne fait jouer que les <video> d'un bloc qui sont à l'écran (ou presque),
// une par une : un bandeau de vingt vidéos n'en décode que trois ou quatre,
// et un téléphone reste fluide. Les vidéos ajoutées plus tard au bloc sont
// suivies aussi. Les vidéos ainsi pilotées n'ont pas besoin d'autoPlay : sans
// lui, celles qui ne sont pas encore à l'écran ne se téléchargent pas.
export function usePauseWhenHidden(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const visible = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const video = target as HTMLVideoElement;
          if (isIntersecting) video.play().catch(() => {});
          else video.pause();
        }
      },
      { rootMargin: "120px" },
    );
    const watch = (root: ParentNode) => root.querySelectorAll("video").forEach((video) => visible.observe(video));
    watch(el);
    const added = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) visible.observe(node);
          else if (node instanceof Element) watch(node);
        });
      }
    });
    added.observe(el, { childList: true, subtree: true });
    return () => {
      visible.disconnect();
      added.disconnect();
    };
  }, [container]);
}
