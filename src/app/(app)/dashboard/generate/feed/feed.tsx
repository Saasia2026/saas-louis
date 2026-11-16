"use client";

import { ChevronDown, ChevronsDown, ChevronUp, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inlinePlaybackBlocked } from "@/app/inline-video";
import { useI18n } from "@/i18n/provider";
import { clipId, type DemoClip } from "../demo-clips";
import { BurstHeart } from "./burst-heart";
import { FeedSlide } from "./feed-slide";
import { FEED_KEYS, readFlag, readSet, sessionSound, setSessionSound, writeFlag, writeSet } from "./feed-store";

const ROUND =
  "pointer-events-auto flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-35";
// Délai pour distinguer un toucher (pause) de deux (j'aime).
const DOUBLE_TAP_MS = 260;
// Visionnage après lequel « Recréer » s'anime.
const PRIME_AFTER_MS = 2500;
// Une vidéo montée de chaque côté de la courante ; le poster seul un peu plus loin.
const POSTER_RANGE = 3;

// Fil de démos façon TikTok, en plein écran : une vidéo par écran, qui joue
// seule tant qu'elle est là, muette jusqu'au premier toucher. Seules la
// vidéo affichée et ses voisines sont montées (préchargées, avec leur
// poster), le reste du fil ne pèse rien. Clavier : ↑ ↓ (vidéo), ← → (5 s),
// espace (pause), M (son), L (j'aime), Échap.
export function DemoFeed({
  clips,
  start,
  onClose,
  onRecreate,
}: {
  clips: DemoClip[];
  start: number;
  onClose: () => void;
  // Faux si le clip n'a pas pu être repris.
  onRecreate: (clip: DemoClip) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const E = t.studio.examples;
  const F = E.feed;
  const feed = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<number, HTMLVideoElement>());
  const [active, setActive] = useState(start);
  const activeRef = useRef(start);
  // Écran visé par le dernier défilement demandé : deux crans rapides
  // avancent de deux, même si le premier n'est pas encore arrivé.
  const target = useRef(start);
  // null : personne n'a encore choisi, le fil reste muet.
  const [sound, setSound] = useState(sessionSound);
  const muted = sound !== true;
  // Lecture en page interdite (voir inline-video) : chaque vidéo attend un toucher.
  const [blocked] = useState(inlinePlaybackBlocked);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [recreating, setRecreating] = useState(false);
  const [primedAt, setPrimedAt] = useState<number | null>(null);
  const [likes, setLikes] = useState(() => readSet(FEED_KEYS.likes));
  const [saves, setSaves] = useState(() => readSet(FEED_KEYS.saves));
  const [auto, setAuto] = useState(() => readFlag(FEED_KEYS.auto));
  const [hint, setHint] = useState(() => !readFlag(FEED_KEYS.hinted));
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const tapTimer = useRef<number | null>(null);
  const clip = clips[active];
  const paused = blocked || pausedAt === active;

  const scrollToClip = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    feed.current?.children[index]?.scrollIntoView({ behavior, block: "start" });
  }, []);

  // La page derrière ne défile plus, et le fil s'ouvre sur la démo touchée.
  useLayoutEffect(() => {
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    scrollToClip(start, "instant");
    feed.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = overflow;
    };
  }, [start, scrollToClip]);

  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          activeRef.current = index;
          target.current = index;
          setActive(index);
          setPausedAt(null);
        }
      },
      { root, threshold: 0.6 },
    );
    [...root.children].forEach((slide) => seen.observe(slide));
    return () => seen.disconnect();
  }, []);

  // Sans geste récent, certains navigateurs refusent le son : la vidéo repart
  // muette plutôt que de rester à l'arrêt.
  const play = useCallback((video: HTMLVideoElement) => {
    video.play().catch((error: DOMException) => {
      if (error.name !== "NotAllowedError" || video.muted) return;
      video.muted = true;
      setSessionSound(null);
      setSound(null);
      video.play().catch(() => {});
    });
  }, []);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (index === active) return;
      if (!video.paused) video.pause();
      if (video.currentTime) video.currentTime = 0;
    });
    const video = videos.current.get(active);
    if (!video) return;
    video.muted = muted;
    if (!blocked && pausedAt !== active) play(video);
  }, [active, muted, blocked, pausedAt, play]);

  useEffect(() => {
    const timer = setTimeout(() => setPrimedAt(active), PRIME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active]);

  // L'astuce « glisse vers le haut » ne se montre qu'à la première visite.
  useEffect(() => {
    if (!hint) return;
    writeFlag(FEED_KEYS.hinted, true);
    const timer = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(timer);
  }, [hint]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    },
    [],
  );

  const flash = useCallback((text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  const go = useCallback(
    (step: number) => {
      const next = Math.min(Math.max(target.current + step, 0), clips.length - 1);
      target.current = next;
      scrollToClip(next);
    },
    [clips.length, scrollToClip],
  );

  // Appelé pendant le geste : le navigateur n'accepte le son qu'à ce moment-là.
  const chooseSound = useCallback((on: boolean) => {
    setSessionSound(on);
    setSound(on);
    const video = videos.current.get(activeRef.current);
    if (video) video.muted = !on;
  }, []);

  const toggleIn = useCallback(
    (key: string, setter: typeof setLikes, index: number, on?: boolean) => {
      const id = clipId(clips[index]);
      setter((prev) => {
        const want = on ?? !prev.has(id);
        if (want === prev.has(id)) return prev;
        const next = new Set(prev);
        if (want) next.add(id);
        else next.delete(id);
        writeSet(key, next);
        return next;
      });
    },
    [clips],
  );

  const onLike = useCallback((index: number) => toggleIn(FEED_KEYS.likes, setLikes, index), [toggleIn]);
  const onSave = useCallback((index: number) => toggleIn(FEED_KEYS.saves, setSaves, index), [toggleIn]);

  const onTap = useCallback(
    (e: React.MouseEvent<HTMLElement>, index: number) => {
      const { clientX: x, clientY: y } = e;
      const video = videos.current.get(index);
      if (blocked) {
        if (video) play(video);
        return;
      }
      if (tapTimer.current !== null) {
        window.clearTimeout(tapTimer.current);
        tapTimer.current = null;
        setHearts((list) => [...list, { id: e.timeStamp, x, y }]);
        toggleIn(FEED_KEYS.likes, setLikes, index, true);
        return;
      }
      // Premier toucher de la visite : il active le son, et c'est tout.
      const first = sessionSound() === null;
      if (first) {
        chooseSound(true);
        if (clips[index].sound) flash(F.soundOnToast);
      }
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = null;
        if (first || !video) return;
        if (video.paused) play(video);
        else video.pause();
      }, DOUBLE_TAP_MS);
    },
    [blocked, play, toggleIn, chooseSound, clips, flash, F.soundOnToast],
  );

  const onPlayState = useCallback((index: number, playing: boolean) => {
    if (playing) setPausedAt(null);
    else if (index === activeRef.current) setPausedAt(index);
  }, []);

  // Défilement automatique : à la fin d'une vidéo, la suivante.
  const onEnded = useCallback(
    (index: number) => {
      if (index !== activeRef.current) return;
      if (index < clips.length - 1) {
        go(1);
        return;
      }
      const video = videos.current.get(index);
      if (!video) return;
      video.currentTime = 0;
      play(video);
    },
    [clips.length, go, play],
  );

  const registerVideo = useCallback((index: number, video: HTMLVideoElement | null) => {
    if (video) videos.current.set(index, video);
    else videos.current.delete(index);
  }, []);

  // Lien vers la démo, ouvrable sans compte (/studio?reel=…). Sur téléphone,
  // la feuille de partage du système ; ailleurs, le lien copié.
  const onShare = useCallback(
    async (index: number) => {
      const url = `${window.location.origin}/studio?reel=${clipId(clips[index])}`;
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        try {
          await navigator.share({ url });
          return;
        } catch (error) {
          if ((error as DOMException).name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        flash(F.linkCopied);
      } catch {
        flash(F.shareFailed);
      }
    },
    [clips, flash, F.linkCopied, F.shareFailed],
  );

  const recreate = useCallback(
    async (index: number) => {
      setRecreating(true);
      setFailedAt(null);
      const ok = await onRecreate(clips[index]);
      setRecreating(false);
      if (ok) onClose();
      else setFailedAt(index);
    },
    [clips, onRecreate, onClose],
  );

  function toggleAuto() {
    writeFlag(FEED_KEYS.auto, !auto);
    setAuto(!auto);
    flash(auto ? F.autoOff : F.autoOn);
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const onButton = e.target instanceof HTMLElement && e.target.closest("button") !== null;
    const video = videos.current.get(active);
    switch (e.key) {
      case "Escape":
        onClose();
        break;
      case "ArrowDown":
      case "PageDown":
        go(1);
        break;
      case "ArrowUp":
      case "PageUp":
        go(-1);
        break;
      case "ArrowLeft":
      case "ArrowRight":
        if (!video?.duration) return;
        video.currentTime = Math.min(
          Math.max(video.currentTime + (e.key === "ArrowRight" ? 5 : -5), 0),
          video.duration - 0.1,
        );
        break;
      case " ":
        if (onButton || !video) return;
        if (video.paused) play(video);
        else video.pause();
        break;
      case "m":
      case "M":
        chooseSound(muted);
        break;
      case "l":
      case "L":
        onLike(active);
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  // Molette et pavé tactile : un geste fait passer une seule vidéo, même si
  // l'inertie envoie encore des dizaines d'événements derrière.
  const wheelStep = useEffectEvent((direction: number) => go(direction));
  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    let locked = false;
    let lockedAt = 0;
    let timer = 0;
    const release = () => {
      const wait = 450 - (Date.now() - lockedAt);
      if (wait > 0) timer = window.setTimeout(release, wait);
      else locked = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      window.clearTimeout(timer);
      timer = window.setTimeout(release, 200);
      if (locked || Math.abs(e.deltaY) < 4) return;
      locked = true;
      lockedAt = Date.now();
      wheelStep(Math.sign(e.deltaY));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, []);

  const labels = useMemo(
    () => ({
      effect: F.effect,
      recreate: F.recreate,
      recreating: E.recreating,
      recreateError: E.recreateError,
      like: F.like,
      save: F.save,
      share: F.share,
    }),
    [E, F],
  );

  return createPortal(
    <div role="dialog" aria-modal aria-label={E.watch} className="fixed inset-0 z-50 bg-black text-white">
      <div
        ref={feed}
        tabIndex={-1}
        className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {clips.map((c, i) => {
          const distance = Math.abs(i - active);
          const id = clipId(c);
          return (
            <FeedSlide
              key={c.base}
              clip={c}
              index={i}
              active={i === active}
              near={distance <= 1}
              poster={distance <= POSTER_RANGE}
              paused={i === active && paused}
              loop={!auto}
              liked={likes.has(id)}
              saved={saves.has(id)}
              primed={primedAt === i}
              recreating={recreating && i === active}
              failed={failedAt === i}
              labels={labels}
              registerVideo={registerVideo}
              onTap={onTap}
              onPlayState={onPlayState}
              onEnded={onEnded}
              onLike={onLike}
              onSave={onSave}
              onShare={onShare}
              onRecreate={recreate}
            />
          );
        })}
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={t.planning.close} title={t.planning.close} className={ROUND}>
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAuto}
            aria-pressed={auto}
            aria-label={F.auto}
            title={F.auto}
            className={`${ROUND} ${auto ? "bg-white! text-black!" : ""}`}
          >
            <ChevronsDown className="size-5" />
          </button>
          {clip.sound &&
            (sound === null ? (
              <button
                type="button"
                onClick={() => chooseSound(true)}
                className="pointer-events-auto flex h-10 items-center gap-2 rounded-full bg-black/40 pr-4 pl-3 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                <VolumeX className="size-5" />
                {F.tapForSound}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => chooseSound(muted)}
                aria-label={muted ? E.soundOn : E.soundOff}
                title={muted ? E.soundOn : E.soundOff}
                className={ROUND}
              >
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
            ))}
        </div>
      </div>

      {/* Ordinateur : flèches au bord de l'écran, en plus du clavier et de la molette. */}
      <div className="pointer-events-none fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 flex-col gap-2 [@media(pointer:fine)]:flex">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={active === 0}
          aria-label={E.previous}
          title={E.previous}
          className={ROUND}
        >
          <ChevronUp className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={active === clips.length - 1}
          aria-label={E.next}
          title={E.next}
          className={ROUND}
        >
          <ChevronDown className="size-5" />
        </button>
      </div>

      {hint && active === start && clips.length > 1 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[30%] z-30 flex flex-col items-center gap-1">
          <ChevronUp className="size-9 animate-bounce drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]" />
          <span className="rounded-full bg-black/55 px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm">
            <span className="[@media(pointer:fine)]:hidden">{F.hintTouch}</span>
            <span className="hidden [@media(pointer:fine)]:inline">{F.hintPointer}</span>
          </span>
        </div>
      )}

      <p
        role="status"
        className={`pointer-events-none fixed top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] left-1/2 z-40 -translate-x-1/2 rounded-full bg-black/70 px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-opacity ${toast ? "opacity-100" : "opacity-0"}`}
      >
        {toast}
      </p>

      <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
        {hearts.map((h) => (
          <BurstHeart
            key={h.id}
            x={h.x}
            y={h.y}
            onDone={() => setHearts((list) => list.filter((other) => other.id !== h.id))}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
