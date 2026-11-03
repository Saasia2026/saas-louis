import { ArrowDownRight, ArrowUpRight, Eye, Music2, Play, WandSparkles } from "lucide-react";
import { after } from "next/server";
import { Suspense } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { VIRAL_QUESTION_CREDITS } from "@/lib/credit-packs";
import {
  hashtagVideos,
  tiktokTrendsEnabled,
  trendPage,
  trendRegion,
  trendVideoTags,
  warmTrendPage,
  type TrendPage,
  type TrendVideo,
} from "@/lib/tiktok-trends";
import { coverSrc } from "@/lib/trend-cover";
import { AskButton } from "./ask-button";
import { HashtagLabel } from "./hashtag-label";
import { MoreTrends } from "./more-trends";
import { Sparkline } from "./sparkline";

// Colonne « en ce moment » : les tendances TikTok du pays utiles à TwinPost
// (triées par Claude, chacune avec une idée de vidéo), puis les vidéos qui
// les portent. Un hashtag ou une vidéo cliqués partent au chat. Le bouton
// « autres tendances » passe à la page suivante (voir trendPage), préparée
// pendant qu'on lit celle-ci.
export async function TrendsAside({ page }: { page: number }) {
  if (!tiktokTrendsEnabled()) return null;
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const V = t.viral;
  const intl = INTL_LOCALES[locale];
  const { picks, pool, next } = await trendPage(locale, page).catch(
    (): TrendPage => ({ picks: [], pool: 0, next: 0 }),
  );
  if (!picks.length) return null;
  if (next !== page) after(() => warmTrendPage(locale, next).catch(() => {}));

  const country = new Intl.DisplayNames([intl], { type: "region" }).of(trendRegion(locale)) ?? trendRegion(locale);
  const compact = new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      <section className="panel animate-fade-up p-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Music2 className="size-4 shrink-0 text-accent-hot" />
            <span className="truncate">{fmt(V.tiktokBoard, { country })}</span>
          </h2>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-xs text-faint">{V.pools[pool]}</span>
            {next !== page && <MoreTrends page={next} label={V.moreTrends} />}
          </span>
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
        <p className="mt-2 px-1.5 text-xs text-faint">{fmt(V.askHint, { n: VIRAL_QUESTION_CREDITS })}</p>
      </section>

      <Suspense fallback={<div aria-hidden className="panel h-80 animate-pulse" />}>
        <TrendVideos hashtags={trendVideoTags(picks)} />
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
          <article
            key={v.id}
            className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2/50 p-1.5 transition-colors hover:border-line-strong"
          >
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="group relative isolate block aspect-[9/16] overflow-hidden rounded-xl bg-gradient-to-b from-neutral-800 to-black"
            >
              {/* Sans couverture, il reste ce fond et le bouton lecture. */}
              <span className="absolute inset-0 -z-10 flex items-center justify-center">
                <span className="flex size-10 items-center justify-center rounded-full border border-white/15 text-white/60">
                  <Play className="ml-0.5 size-4" />
                </span>
              </span>
              {/* Couverture TikTok, servie par notre relais (voir api/trends/cover).
                  En fond plutôt qu'en <img> : un lien mort ne laisse pas d'icône cassée. */}
              <span
                aria-hidden
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ backgroundImage: `url("${coverSrc(v.cover)}")` }}
              />
              <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums backdrop-blur-sm">
                <Eye className="size-3" />
                {compact.format(v.views)}
              </span>
              <span className="absolute inset-x-2.5 bottom-2.5 truncate font-headline text-base leading-none text-white uppercase">
                {v.hashtag}
              </span>
            </a>
            {v.sound && (
              <p
                className="mx-0.5 flex min-w-0 items-center gap-1.5 rounded-lg bg-surface-3/60 px-2 py-1 text-[0.6875rem] text-muted"
                title={v.sound}
              >
                <Music2 className="size-3 shrink-0 text-accent-hot" />
                <span className="truncate">{v.sound}</span>
              </p>
            )}
            <AskButton
              question={fmt(V.askVideo, { hashtag: v.hashtag, caption: v.caption || v.hashtag, url: v.url })}
              className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-surface-3 px-2 py-2 text-center text-[0.6875rem] leading-tight font-semibold text-balance text-text transition-colors hover:bg-accent hover:text-white"
            >
              <WandSparkles className="size-3.5 shrink-0" />
              {V.remake}
            </AskButton>
          </article>
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
