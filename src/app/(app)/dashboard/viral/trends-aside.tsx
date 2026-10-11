import { ArrowDownRight, ArrowUpRight, Music2, Play, WandSparkles } from "lucide-react";
import { Suspense } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  hashtagVideos,
  tiktokTrendsEnabled,
  trendPicks,
  trendRegion,
  type TrendPick,
  type TrendVideo,
} from "@/lib/tiktok-trends";
import { coverSrc } from "@/lib/trend-cover";
import { AskButton } from "./ask-button";
import { HashtagLabel } from "./hashtag-label";
import { Sparkline } from "./sparkline";

// Colonne « en ce moment » : les tendances TikTok du pays utiles à TwinPost
// (triées par Claude, chacune avec une idée de vidéo), puis les vidéos qui
// les portent. Un hashtag ou une vidéo cliqués partent au chat.
export async function TrendsAside() {
  if (!tiktokTrendsEnabled()) return null;
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const V = t.viral;
  const intl = INTL_LOCALES[locale];
  const picks = await trendPicks(locale).catch((): TrendPick[] => []);
  if (!picks.length) return null;

  const country = new Intl.DisplayNames([intl], { type: "region" }).of(trendRegion(locale)) ?? trendRegion(locale);
  const compact = new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      <section className="panel animate-fade-up p-4">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Music2 className="size-4 text-accent-hot" />
            {fmt(V.tiktokBoard, { country })}
          </h2>
          <span className="text-xs text-faint">{V.lastDays}</span>
        </div>
        <ol className="mt-3 space-y-0.5">
          {picks.map((p) => (
            <li key={p.hashtag}>
              <AskButton
                question={fmt(V.askHashtag, { hashtag: p.hashtag })}
                className="group w-full rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-text">
                    <HashtagLabel tag={p.hashtag} />
                  </span>
                  <Sparkline values={p.curve} />
                  <span className="w-11 shrink-0 text-right text-xs text-faint tabular-nums">
                    {compact.format(p.views)}
                  </span>
                  {p.direction === "down" ? (
                    <ArrowDownRight className="size-3.5 shrink-0 text-danger" />
                  ) : (
                    <ArrowUpRight className="size-3.5 shrink-0 text-success" />
                  )}
                </span>
                {p.angle && <span className="mt-0.5 block text-xs leading-snug text-muted">{p.angle}</span>}
              </AskButton>
            </li>
          ))}
        </ol>
        <p className="mt-2 px-1.5 text-xs text-faint">{V.askHint}</p>
      </section>

      <Suspense fallback={<div aria-hidden className="panel h-80 animate-pulse" />}>
        <TrendVideos hashtags={picks.slice(0, 3).map((p) => p.hashtag)} />
      </Suspense>
    </aside>
  );
}

// Vidéos TikTok les plus vues des premières tendances retenues.
async function TrendVideos({ hashtags }: { hashtags: string[] }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const V = t.viral;
  const videos = await hashtagVideos(hashtags, 2).catch((): TrendVideo[] => []);
  if (!videos.length) return null;
  const compact = new Intl.NumberFormat(INTL_LOCALES[locale], { notation: "compact", maximumFractionDigits: 1 });

  return (
    <section className="panel animate-fade-up p-4">
      <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
        <Play className="size-4 text-accent-hot" />
        {V.videosBoard}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {videos.map((v) => (
          <div key={v.id} className="overflow-hidden rounded-xl border border-line bg-surface">
            <a href={v.url} target="_blank" rel="noreferrer" className="group relative block bg-black">
              {/* Couverture TikTok, servie par notre relais (voir api/trends/cover). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSrc(v.cover)}
                alt=""
                loading="lazy"
                className="aspect-[9/16] w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute top-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums">
                {fmt(V.views, { n: compact.format(v.views) })}
              </span>
              <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white">
                {v.hashtag}
              </span>
            </a>
            <div className="space-y-1.5 p-2">
              {v.sound && (
                <p className="flex items-center gap-1 truncate text-[0.6875rem] text-faint" title={v.sound}>
                  <Music2 className="size-3 shrink-0" />
                  {v.sound}
                </p>
              )}
              <AskButton
                question={fmt(V.askVideo, { hashtag: v.hashtag, caption: v.caption || v.hashtag, url: v.url })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-text"
              >
                <WandSparkles className="size-3.5" />
                {V.remake}
              </AskButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrendsAsideSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="panel h-[26rem] animate-pulse" />
      <div className="panel h-72 animate-pulse" />
    </div>
  );
}
