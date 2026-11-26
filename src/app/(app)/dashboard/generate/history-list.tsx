"use client";

import {
  Download,
  Film,
  Ghost,
  PawPrint,
  Play,
  RefreshCw,
  Trash2,
  UserRound,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { playInline } from "@/app/inline-video";
import { usePauseWhenHidden } from "@/app/pause-hidden";
import { PlayerBar, usePlayer } from "@/app/video-player";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { AspectRatio } from "@/lib/generation";
import { CopyButton, PromptText, RefStrip } from "../generation-details";
import type { SwapHistoryItem } from "../swap-history";
import { DeleteButton } from "../videos/delete-button";
import H from "./history.module.css";

// Hauteur du cadre de la vidéo selon son format ; le 16:9 prend la largeur.
const FRAME: Record<AspectRatio, React.CSSProperties> = {
  "9:16": { height: "min(68vh, 32rem)", maxWidth: "100%" },
  "1:1": { height: "min(56vh, 26rem)", maxWidth: "100%" },
  "16:9": { width: "100%" },
};

// Les rendus, un par carte, au style de l'écran de résultat : la vidéo
// cadrée à gauche sur sa propre lumière ; à droite le mode en titre, le
// prompt, les références (clip, images, lieu), les réglages, puis
// télécharger, « Réutiliser », analyser, copier le prompt et supprimer.
// `onReuse` : le studio reprend le rendu sur place ; sans lui (Mes vidéos),
// « Réutiliser » y mène.
export function HistoryList({
  items,
  onReuse,
}: {
  items: SwapHistoryItem[];
  onReuse?: (item: SwapHistoryItem) => void;
}) {
  return (
    <ul className={`${H.list} w-full`} style={{ containerType: "inline-size" }}>
      {items.map((item) => (
        <li key={item.id} className={`${H.card} animate-fade-up`}>
          {item.mediaUrl && (
            <video src={`${item.mediaUrl}#t=0.1`} preload="metadata" muted playsInline aria-hidden className={H.ambient} />
          )}
          <span aria-hidden className={H.veil} />
          <Stage item={item} />
          <Details item={item} onReuse={onReuse} />
        </li>
      ))}
    </ul>
  );
}

// La vidéo cadrée, sa barre de lecture posée dessus, le téléchargement en
// haut à droite.
function Stage({ item }: { item: SwapHistoryItem }) {
  const { t } = useI18n();
  const V = t.videos;
  const player = usePlayer({ muted: false });
  return (
    <div className={H.stage}>
      <div className={`group ${H.frame}`} style={{ aspectRatio: item.aspectRatio.replace(":", " / "), ...FRAME[item.aspectRatio] }}>
        {item.mediaUrl ? (
          <>
            <video
              // #t= : la première image s'affiche avant la lecture.
              src={`${item.mediaUrl}#t=0.1`}
              preload="metadata"
              loop
              playsInline
              webkit-playsinline=""
              {...player.videoProps}
              className="size-full cursor-pointer object-contain"
            />
            {!player.playing && (
              <span className="pointer-events-none absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform duration-200 group-hover:scale-110">
                <Play className="size-6 translate-x-0.5 fill-current" />
              </span>
            )}
            {player.ready && <PlayerBar player={player} overlay compact />}
          </>
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/70">
            <span className="size-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            {V.running}
          </span>
        )}
      </div>
      {item.mediaUrl && (
        <a href={item.downloadUrl ?? item.mediaUrl} aria-label={V.download} title={V.download} className={H.download}>
          <Download />
        </a>
      )}
    </div>
  );
}

// Colonne de droite : tout ce qui a servi au rendu, et ses actions.
function Details({ item, onReuse }: { item: SwapHistoryItem; onReuse?: (item: SwapHistoryItem) => void }) {
  const { t } = useI18n();
  const V = t.videos;
  const S = t.studio;
  const mode = item.restyle
    ? `${S.modeRestyle}${item.restyle.name ? ` · ${item.restyle.name}` : ""}`
    : item.transfer
      ? S.modeTransfer
      : S.modeReplace;
  const engine = item.settings.model === "max" ? S.modelMax : S.modelStandard;
  const hasRefs = Boolean(item.clip || item.refs.length > 0 || item.decor);
  const reuse = onReuse ? (
    <button type="button" onClick={() => onReuse(item)} title={S.reuseHint} className="btn btn-secondary">
      <RefreshCw />
      {S.reuse}
    </button>
  ) : (
    <Link href={`/dashboard/generate?reuse=${item.id}`} title={S.reuseHint} className="btn btn-secondary">
      <RefreshCw />
      {S.reuse}
    </Link>
  );

  return (
    <div className={H.side}>
      <h3 className={H.title}>
        {mode}
        <em>{engine}</em>
      </h3>

      <div className={H.block}>
        <p className={H.label}>{S.yourPrompt}</p>
        <PromptText prompt={item.prompt} />
      </div>

      {hasRefs && (
        <div className={H.block}>
          <p className={H.label}>{S.references}</p>
          <RefStrip item={item} />
        </div>
      )}

      <ul className={H.facts}>
        <li>{item.settings.quality}</li>
        {item.seconds ? <li>{fmt(V.seconds, { seconds: item.seconds })}</li> : null}
        <li>{item.aspectRatio}</li>
        {item.fidelity && <li className={H.solid}>{S.methodFidelity}</li>}
      </ul>
      {item.incomplete && <p className={H.warn}>{item.incomplete}</p>}

      <div className={H.actions}>
        {item.running ? (
          <Link href={`/dashboard/generate?v=${item.id}`} className="btn btn-primary">
            {V.resume}
          </Link>
        ) : (
          reuse
        )}
        <div className={H.foot}>
          <span>{item.date}</span>
          {item.prompt.trim() && <CopyButton text={item.prompt} label={S.copyPrompt} className="size-9" />}
          <DeleteButton
            id={item.id}
            confirm={V.deleteConfirm}
            icon={Trash2}
            className="size-9 text-muted hover:bg-danger/15 hover:text-danger"
          />
        </div>
      </div>
    </div>
  );
}

// Démo du studio tant que l'historique est vide : les quatre étapes jouées en
// boucle avec un vrai remplacement (clip d'origine, personnage, rendu).
const DEMO_MS = [2600, 2600, 2400, 5600];
const DEMO = {
  before: "/examples/micro-avant",
  after: "/examples/micro-apres",
  character: "/examples/micro-perso.jpg",
};

const reducedMotion = {
  query: () => window.matchMedia("(prefers-reduced-motion: reduce)"),
  subscribe(onChange: () => void) {
    const query = reducedMotion.query();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  },
};

// Tuile vide de la démo, comme celles du studio.
function DemoEmpty({ icons }: { icons: LucideIcon[] }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="flex -space-x-2">
        {icons.map((Icon, i) => (
          <span
            key={i}
            className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-gradient-to-b from-surface-3 to-surface-2 text-muted ring-2 ring-surface"
          >
            <Icon className="size-4" />
          </span>
        ))}
      </span>
    </span>
  );
}

export function HistoryEmpty() {
  const { t } = useI18n();
  const D = t.studio.demo;
  const reduced = useSyncExternalStore(reducedMotion.subscribe, () => reducedMotion.query().matches, () => false);
  const [{ step, cycle }, setDemo] = useState({ step: 0, cycle: 0 });
  // Mouvement réduit : la démo reste sur son résultat.
  const shown = reduced ? 3 : step;
  const root = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLVideoElement>(null);
  const result = useRef<HTMLVideoElement>(null);
  usePauseWhenHidden(root);

  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(
      () => setDemo((d) => (d.step === 3 ? { step: 0, cycle: d.cycle + 1 } : { ...d, step: d.step + 1 })),
      DEMO_MS[step],
    );
    return () => clearTimeout(id);
  }, [step, reduced]);

  // Le rendu apparaît calé sur le clip d'origine : mêmes gestes côte à côte.
  useEffect(() => {
    const video = result.current;
    if (shown !== 3 || !video) return;
    video.currentTime = clip.current?.currentTime ?? 0;
    playInline(video);
  }, [shown, cycle]);

  const drop = reduced ? "" : "animate-demo-drop";
  const visual = (i: number) => {
    if (i === 0) {
      return (
        <>
          <DemoEmpty icons={[Video]} />
          <video
            ref={clip}
            key={`clip-${cycle}`}
            src={`${DEMO.before}.mp4`}
            poster={`${DEMO.before}.jpg`}
            muted
            loop
            playsInline
            webkit-playsinline=""
            disablePictureInPicture
            disableRemotePlayback
            preload="metadata"
            aria-hidden
            className={`pointer-events-none absolute inset-0 size-full object-cover ${drop}`}
          />
        </>
      );
    }
    if (i === 1) {
      return shown >= 1 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`character-${cycle}`}
          src={DEMO.character}
          alt=""
          className={`absolute inset-0 size-full object-cover ${drop}`}
        />
      ) : (
        <DemoEmpty icons={[UserRound, PawPrint, Ghost]} />
      );
    }
    if (i === 2) {
      return (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4">
          <span
            className={`btn btn-accent pointer-events-none transition-transform duration-150 ${
              shown === 2 ? "translate-y-0.5" : ""
            }`}
          >
            <WandSparkles />
            {t.studio.launch}
          </span>
          <span className="h-1 w-3/4 overflow-hidden rounded-full bg-surface-3">
            <span
              key={`progress-${cycle}-${shown}`}
              className={`block h-full origin-left rounded-full bg-brand ${
                shown === 2 ? "animate-feature-progress" : shown === 3 ? "" : "scale-x-0"
              }`}
              style={shown === 2 ? { animationDuration: `${DEMO_MS[2]}ms` } : undefined}
            />
          </span>
        </span>
      );
    }
    return (
      <>
        <DemoEmpty icons={[Film]} />
        <video
          ref={result}
          src={`${DEMO.after}.mp4`}
          poster={`${DEMO.after}.jpg`}
          muted
          loop
          playsInline
          webkit-playsinline=""
          disablePictureInPicture
          disableRemotePlayback
          preload="metadata"
          aria-hidden
          className={`pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-700 ${
            shown === 3 ? "opacity-100" : "opacity-0"
          }`}
        />
      </>
    );
  };

  return (
    <div ref={root} className="panel animate-fade-up p-4 sm:p-5">
      <ol aria-label={D.title} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {D.steps.map((s, i) => {
          const active = shown === i;
          return (
            <li key={s.title} className={`transition-opacity duration-300 ${active || reduced ? "" : "opacity-55"}`}>
              <div
                className={`relative aspect-[9/16] overflow-hidden rounded-2xl border bg-surface-2/40 bg-clip-padding transition-colors duration-300 ${
                  active ? "border-white/60" : "border-line"
                }`}
              >
                {visual(i)}
              </div>
              <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] tabular-nums transition-colors duration-300 ${
                    active ? "bg-white text-black" : "bg-surface-3 text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                {s.title}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
