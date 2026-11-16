"use client";

import { ChevronDown, ChevronsDown, ChevronUp, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inlinePlaybackBlocked } from "@/app/inline-video";
import { useI18n } from "@/i18n/provider";
import { BurstHeart } from "./burst-heart";
import { useFeedReactions, type FeedItem } from "./feed-items";
import { FeedSlide } from "./feed-slide";
import { FEED_KEYS, readFlag, readSet, sessionSound, setSessionSound, writeFlag, writeSet } from "./feed-store";
import type { FeedPlayer } from "./player";

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
// poster), le reste du fil ne pèse rien ; une vidéo TikTok n'a son lecteur
// que lorsqu'elle est affichée. Clavier : ↑ ↓ (vidéo), ← → (5 s), espace
// (pause), M (son), L (j'aime), Échap.
export function DemoFeed({
  items,
  start,
  onClose,
  onRecreate,
}: {
  items: FeedItem[];
  start: number;
  onClose: () => void;
  // Faux si la vidéo n'a pas pu être reprise.
  onRecreate: (item: FeedItem) => Promise<boolean>;
}) {
  const { t, locale } = useI18n();
  const E = t.studio.examples;
  const F = E.feed;
  const feed = useRef<HTMLDivElement>(null);
  const players = useRef(new Map<number, FeedPlayer>());
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
  const item = items[active];
  const paused = blocked || pausedAt === active;

  // Les j'aime déjà enregistrés sur le compte s'ajoutent à ceux du navigateur.
  const reactions = useFeedReactions(items, (slugs) =>
    setLikes((prev) => {
      const next = new Set([...prev, ...slugs]);
      writeSet(FEED_KEYS.likes, next);
      return next;
    }),
  );
  const { userId, likedAtLoad, saveLike, saveRecreate } = reactions;

  const compact = useMemo(() => new Intl.NumberFormat(locale, { notation: "compact" }), [locale]);
  const format = useCallback((n: number) => compact.format(n), [compact]);

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
  const play = useCallback((player: FeedPlayer) => {
    player.play().catch((error: DOMException) => {
      if (error.name !== "NotAllowedError" || player.muted) return;
      player.setMuted(true);
      setSessionSound(null);
      setSound(null);
      player.play().catch(() => {});
    });
  }, []);

  useEffect(() => {
    players.current.forEach((player, index) => {
      if (index === active) return;
      if (!player.paused) player.pause();
      if (player.progress()?.current) player.seek(0);
    });
    const player = players.current.get(active);
    if (!player) return;
    player.setMuted(muted);
    if (!blocked && pausedAt !== active) play(player);
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
      const next = Math.min(Math.max(target.current + step, 0), items.length - 1);
      target.current = next;
      scrollToClip(next);
    },
    [items.length, scrollToClip],
  );

  // Appelé pendant le geste : le navigateur n'accepte le son qu'à ce moment-là.
  const chooseSound = useCallback((on: boolean) => {
    setSessionSound(on);
    setSound(on);
    players.current.get(activeRef.current)?.setMuted(!on);
  }, []);

  const setLike = useCallback(
    (index: number, on?: boolean) => {
      const it = items[index];
      const want = on ?? !likes.has(it.slug);
      if (want === likes.has(it.slug)) return;
      const next = new Set(likes);
      if (want) next.add(it.slug);
      else next.delete(it.slug);
      writeSet(FEED_KEYS.likes, next);
      setLikes(next);
      void saveLike(it, want);
    },
    [items, likes, saveLike],
  );

  const onLike = useCallback((index: number) => setLike(index), [setLike]);
  const onSave = useCallback(
    (index: number) => {
      const slug = items[index].slug;
      setSaves((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        writeSet(FEED_KEYS.saves, next);
        return next;
      });
    },
    [items],
  );

  const onTap = useCallback(
    (e: React.MouseEvent<HTMLElement>, index: number) => {
      const { clientX: x, clientY: y } = e;
      const player = players.current.get(index);
      if (blocked) {
        if (player) play(player);
        return;
      }
      if (tapTimer.current !== null) {
        window.clearTimeout(tapTimer.current);
        tapTimer.current = null;
        setHearts((list) => [...list, { id: e.timeStamp, x, y }]);
        setLike(index, true);
        return;
      }
      // Premier toucher de la visite : il active le son, et c'est tout.
      const first = sessionSound() === null;
      if (first) {
        chooseSound(true);
        if (items[index].hasSound || items[index].tiktokId) flash(F.soundOnToast);
      }
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = null;
        if (first || !player) return;
        if (player.paused) play(player);
        else player.pause();
      }, DOUBLE_TAP_MS);
    },
    [blocked, play, setLike, chooseSound, items, flash, F.soundOnToast],
  );

  const onPlayState = useCallback((index: number, playing: boolean) => {
    if (playing) setPausedAt(null);
    else if (index === activeRef.current) setPausedAt(index);
  }, []);

  // Défilement automatique : à la fin d'une vidéo, la suivante.
  const onEnded = useCallback(
    (index: number) => {
      if (index !== activeRef.current) return;
      if (index < items.length - 1) {
        go(1);
        return;
      }
      const player = players.current.get(index);
      if (!player) return;
      player.seek(0);
      play(player);
    },
    [items.length, go, play],
  );

  const registerPlayer = useCallback((index: number, player: FeedPlayer | null) => {
    if (player) players.current.set(index, player);
    else players.current.delete(index);
  }, []);
  const getPlayer = useCallback((index: number) => players.current.get(index), []);

  // Lien vers la démo, ouvrable sans compte (/studio?reel=…). Sur téléphone,
  // la feuille de partage du système ; ailleurs, le lien copié.
  const onShare = useCallback(
    async (index: number) => {
      const url = `${window.location.origin}/studio?reel=${items[index].slug}`;
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
    [items, flash, F.linkCopied, F.shareFailed],
  );

  const recreate = useCallback(
    async (index: number) => {
      setRecreating(true);
      setFailedAt(null);
      const ok = await onRecreate(items[index]);
      setRecreating(false);
      if (!ok) {
        setFailedAt(index);
        return;
      }
      void saveRecreate(items[index]);
      onClose();
    },
    [items, onRecreate, onClose, saveRecreate],
  );

  function toggleAuto() {
    writeFlag(FEED_KEYS.auto, !auto);
    setAuto(!auto);
    flash(auto ? F.autoOff : F.autoOn);
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const onButton = e.target instanceof HTMLElement && e.target.closest("button, a") !== null;
    const player = players.current.get(active);
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
      case "ArrowRight": {
        const progress = player?.progress();
        if (!player || !progress) return;
        player.seek(
          Math.min(
            Math.max(progress.current + (e.key === "ArrowRight" ? 5 : -5), 0),
            progress.duration - 0.1,
          ),
        );
        break;
      }
      case " ":
        if (onButton || !player) return;
        if (player.paused) play(player);
        else player.pause();
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
      effectPersonas: F.effectPersonas,
      recreate: F.recreate,
      recreateOwn: F.recreateOwn,
      recreating: E.recreating,
      recreateError: E.recreateError,
      before: F.before,
      after: F.after,
      like: F.like,
      save: F.save,
      share: F.share,
      recreations: F.recreations,
      profile: F.profile,
    }),
    [E, F],
  );

  // Chiffre de j'aime affiché : celui de la base, corrigé du j'aime de ce
  // compte s'il vient de changer. Sans compte, la base seule.
  function likesShown(it: FeedItem) {
    if (!userId) return it.likeCount;
    return it.likeCount - (likedAtLoad.has(it.slug) ? 1 : 0) + (likes.has(it.slug) ? 1 : 0);
  }

  return createPortal(
    <div role="dialog" aria-modal aria-label={E.watch} className="fixed inset-0 z-50 bg-black text-white">
      <div
        ref={feed}
        tabIndex={-1}
        className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it, i) => {
          const distance = Math.abs(i - active);
          return (
            <FeedSlide
              key={it.slug}
              item={it}
              index={i}
              active={i === active}
              near={distance <= 1}
              poster={distance <= POSTER_RANGE}
              paused={i === active && paused}
              loop={!auto}
              liked={likes.has(it.slug)}
              saved={saves.has(it.slug)}
              likes={likesShown(it)}
              primed={primedAt === i}
              recreating={recreating && i === active}
              failed={failedAt === i}
              labels={labels}
              format={format}
              registerPlayer={registerPlayer}
              getPlayer={getPlayer}
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
          {(item.hasSound || item.tiktokId) &&
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
          disabled={active === items.length - 1}
          aria-label={E.next}
          title={E.next}
          className={ROUND}
        >
          <ChevronDown className="size-5" />
        </button>
      </div>

      {hint && active === start && items.length > 1 && (
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
