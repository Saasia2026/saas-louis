import { useEffect, type RefObject } from "react";

// Coupe les <video> d'un bloc quand il sort de l'écran, et les relance à son
// retour : huit lectures simultanées mettent les machines modestes à genoux.
export function usePauseWhenHidden(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        el.querySelectorAll("video").forEach((video) => {
          if (entry.isIntersecting) video.play().catch(() => {});
          else video.pause();
        });
      },
      { rootMargin: "150px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [container]);
}
