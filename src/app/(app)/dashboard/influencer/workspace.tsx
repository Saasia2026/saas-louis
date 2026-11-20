"use client";

import { Check, ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { TitleLines } from "@/app/title-lines";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { INFLUENCER_CREDITS, INFLUENCER_PRESETS, presetImage } from "@/lib/influencer";
import { deleteInfluencer } from "./actions";
import { InfluencerCreator, type CreatedInfluencer } from "./creator";
import s from "./influencer.module.css";

// Page Influenceur IA : titre centré, onglets « Exemples » et « Mes
// influenceurs », deux rangées de portraits ronds qui défilent (un rond
// « Créer » au milieu), puis le générateur. Un portrait d'exemple le choisit
// dans le générateur ; un de ses influenceurs part dans le studio.
export function InfluencerWorkspace({
  userId,
  credits,
  initial,
}: {
  userId: string;
  credits: number;
  initial: CreatedInfluencer[];
}) {
  const { t } = useI18n();
  const I = t.influencer;
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<"examples" | "mine">("examples");
  const [preset, setPreset] = useState<string | null>(null);
  const [, startDeleting] = useTransition();
  const track = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.7, behavior: "smooth" });
  const toComposer = () => composer.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const createCircle = (
    <button
      key="create"
      type="button"
      className={s.create}
      onClick={() => {
        setPreset(null);
        toComposer();
      }}
    >
      <Sparkles />
      {I.createCircle}
    </button>
  );

  // Le rond « Créer » au milieu des exemples, en tête de ses influenceurs.
  const examples = INFLUENCER_PRESETS.map((p) => (
    <button
      key={p.id}
      type="button"
      aria-pressed={preset === p.id}
      aria-label={I.example}
      className={s.face}
      onClick={() => {
        setPreset(preset === p.id ? null : p.id);
        toComposer();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={presetImage(p.id)} alt="" loading="lazy" />
      {preset === p.id && (
        <span className={s.check}>
          <Check />
        </span>
      )}
    </button>
  ));
  const middle = Math.floor(examples.length / 2);
  const exampleItems = [...examples.slice(0, middle), createCircle, ...examples.slice(middle)];

  const mineItems = [
    createCircle,
    ...items.map((item) => (
      <div key={item.id} className={s.mine}>
        <Link href={`/dashboard/generate?influencer=${item.id}`} className={s.face} title={I.useShort}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" loading="lazy" />
        </Link>
        <button
          type="button"
          title={I.delete}
          className={s.remove}
          onClick={() =>
            startDeleting(async () => {
              if (await deleteInfluencer(item.id)) setItems((list) => list.filter((x) => x.id !== item.id));
            })
          }
        >
          <Trash2 />
          <span className="sr-only">{I.delete}</span>
        </button>
      </div>
    )),
  ];

  return (
    <>
      <header className={`${s.head} animate-fade-up`}>
        <p className="eyebrow justify-center">{I.eyebrow}</p>
        <h1 className={s.title}>
          <TitleLines text={I.headline} />
        </h1>
        <p className={s.intro}>
          {I.intro} {fmt(I.factCost, { n: INFLUENCER_CREDITS })} · {I.factTime}
        </p>
        <div className={s.tabs}>
          <button type="button" aria-pressed={tab === "examples"} onClick={() => setTab("examples")}>
            {I.tabExamples}
          </button>
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
            {I.tabMine}
            {items.length > 0 && <small>{items.length}</small>}
          </button>
        </div>
      </header>

      <div className={s.carousel}>
        <button type="button" className={`${s.arrow} ${s.prev}`} onClick={() => scroll(-1)} aria-label={t.bots.prev}>
          <ChevronLeft />
        </button>
        <div ref={track} className={s.track}>
          {tab === "examples" ? exampleItems : mineItems}
        </div>
        <button type="button" className={`${s.arrow} ${s.next}`} onClick={() => scroll(1)} aria-label={t.bots.next}>
          <ChevronRight />
        </button>
      </div>
      {tab === "mine" && items.length === 0 && <p className={s.empty}>{I.mineEmpty}</p>}

      <div ref={composer} className={s.composer}>
        <InfluencerCreator
          userId={userId}
          credits={credits}
          preset={preset}
          onPresetChange={setPreset}
          hideExamples
          onCreated={(created) => {
            setItems((list) => [created, ...list]);
          }}
        />
      </div>
    </>
  );
}
