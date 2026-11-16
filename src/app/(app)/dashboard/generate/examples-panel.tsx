"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { useI18n } from "@/i18n/provider";
import { DemoFeed } from "./feed/feed";
import { useFeedItems, type FeedItem } from "./feed/feed-items";

function Clip({ item, label, onOpen, className = "" }: { item: FeedItem; label: string; onOpen: () => void; className?: string }) {
  return (
    <button type="button" onClick={onOpen} aria-label={label} className="block size-full cursor-pointer">
      <video
        src={item.videoUrl}
        poster={item.posterUrl ?? undefined}
        muted
        loop
        playsInline
        webkit-playsinline=""
        disablePictureInPicture
        disableRemotePlayback
        preload="none"
        aria-hidden
        className={`pointer-events-none size-full object-cover ${className}`}
      />
    </button>
  );
}

// Vignettes affichées d'un coup : le fil, lui, montre toutes les démos, et
// charger toutes les couvertures à l'ouverture pèserait sur un téléphone.
const MOSAIC_STEP = 48;

// Onglet Exemples : l'idée en une phrase à côté d'un rendu, puis une
// mosaïque de rendus qui ne jouent qu'à l'écran. Une démo touchée ouvre le
// fil façon TikTok, d'où elle peut être reprise dans le studio.
export function ExamplesPanel({
  onRecreate,
}: {
  // Reprend une vidéo du fil dans le studio ; faux en cas d'échec.
  onRecreate: (video: { url: string; name: string }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const E = t.studio.examples;
  const root = useRef<HTMLDivElement>(null);
  const { items, ready } = useFeedItems();
  const [hero, ...mosaic] = items;
  // Fil ouvert : sa liste est figée le temps de la visite, pour qu'un
  // chargement de la base n'en décale pas les vidéos.
  const [session, setSession] = useState<{ items: FeedItem[]; startSlug: string } | null>(null);
  const [shown, setShown] = useState(MOSAIC_STEP);
  const linkHandled = useRef(false);
  usePauseWhenHidden(root, session !== null);

  // Lien partagé depuis le fil (?reel=g-24) : la démo s'ouvre directement,
  // une fois la base lue (les j'aime ont besoin des identifiants de la table).
  useEffect(() => {
    if (linkHandled.current || !ready) return;
    const slug = new URLSearchParams(window.location.search).get("reel");
    const index = slug ? items.findIndex((item) => item.slug === slug) : -1;
    if (index < 0) return;
    const timer = setTimeout(() => {
      linkHandled.current = true;
      setSession({ items, startSlug: items[index].slug });
    }, 0);
    return () => clearTimeout(timer);
  }, [items, ready]);

  function open(index: number) {
    setSession({ items, startSlug: items[index].slug });
  }

  function close() {
    setSession(null);
    const url = new URL(window.location.href);
    if (!url.searchParams.has("reel")) return;
    url.searchParams.delete("reel");
    window.history.replaceState(null, "", url);
  }

  function recreate(item: FeedItem) {
    return onRecreate({ url: item.videoUrl, name: item.slug });
  }

  return (
    <div ref={root} className="space-y-5">
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h2 className="font-headline text-4xl leading-[0.92] uppercase sm:text-5xl">{E.title}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{E.text}</p>
          <button type="button" onClick={() => open(0)} className="btn btn-secondary mt-4 px-4 py-2 text-sm">
            <Play />
            {E.watch}
          </button>
        </div>
        {hero && (
          <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-black bg-clip-padding">
            <Clip item={hero} label={E.open} onOpen={() => open(0)} />
          </div>
        )}
      </div>
      <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
        {mosaic.slice(0, shown).map((item, i) => (
          <div
            key={item.slug}
            style={{ aspectRatio: item.ratio }}
            className="group break-inside-avoid overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
          >
            <Clip
              item={item}
              label={E.open}
              onOpen={() => open(i + 1)}
              className="transition-transform duration-500 group-hover:scale-[1.04]"
            />
          </div>
        ))}
      </div>
      {shown < mosaic.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + MOSAIC_STEP)}
          className="btn btn-secondary mx-auto flex px-5 py-2 text-sm"
        >
          {E.showMore}
        </button>
      )}
      {session && (
        <DemoFeed items={session.items} startSlug={session.startSlug} onClose={close} onRecreate={recreate} />
      )}
    </div>
  );
}
