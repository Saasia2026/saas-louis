import { ArrowDownRight, ArrowUpRight, Music2, Play } from "lucide-react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { tiktokTrends, tiktokTrendsEnabled, trendRegion, type TikTokHashtag } from "@/lib/tiktok-trends";
import { trendingVideos, youtubeEnabled, type TrendingVideo } from "@/lib/youtube";
import { AskButton } from "./ask-button";
import { Sparkline } from "./sparkline";

// Colonne « en ce moment » : les hashtags TikTok et les Shorts en tendance du
// pays, visibles avant toute question. Un hashtag cliqué part au chat.
export async function TrendsAside() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const V = t.viral;
  const region = trendRegion(locale);
  const intl = INTL_LOCALES[locale];
  const [hashtags, shorts] = await Promise.all([
    tiktokTrendsEnabled()
      ? tiktokTrends({ countryCode: region, period: "7", onlyNew: false }).catch((): TikTokHashtag[] => [])
      : [],
    youtubeEnabled()
      ? trendingVideos({ regionCode: region, shortsOnly: true, limit: 4 }).catch((): TrendingVideo[] => [])
      : [],
  ]);
  if (!hashtags.length && !shorts.length) return null;

  const country = new Intl.DisplayNames([intl], { type: "region" }).of(region) ?? region;
  const compact = new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      {hashtags.length > 0 && (
        <section className="panel animate-fade-up p-4">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Music2 className="size-4 text-accent-light" />
              {fmt(V.tiktokBoard, { country })}
            </h2>
            <span className="text-xs text-faint">{V.lastDays}</span>
          </div>
          <ol className="mt-3">
            {hashtags.slice(0, 10).map((h) => (
              <li key={h.hashtag}>
                <AskButton
                  question={fmt(V.askHashtag, { hashtag: h.hashtag })}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="w-5 shrink-0 text-right font-headline text-base leading-none text-faint tabular-nums">
                    {h.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-text">
                    {h.hashtag}
                  </span>
                  <Sparkline values={h.curve} />
                  <span className="w-11 shrink-0 text-right text-xs text-faint tabular-nums">
                    {compact.format(h.views)}
                  </span>
                  {h.direction === "down" ? (
                    <ArrowDownRight className="size-3.5 shrink-0 text-danger" />
                  ) : (
                    <ArrowUpRight className="size-3.5 shrink-0 text-success" />
                  )}
                </AskButton>
              </li>
            ))}
          </ol>
          <p className="mt-2 px-1 text-xs text-faint">{V.askHint}</p>
        </section>
      )}

      {shorts.length > 0 && (
        <section className="panel animate-fade-up p-4 [animation-delay:120ms]">
          <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
            <Play className="size-4 text-accent-light" />
            {V.shortsBoard}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {shorts.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
              >
                {/* Miniature hébergée par YouTube : pas d'optimisation Next. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.thumbnail}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="block bg-surface p-2">
                  <span className="line-clamp-2 text-xs leading-snug font-medium">{v.title}</span>
                  <span className="mt-1 block text-[0.6875rem] text-faint tabular-nums">
                    {fmt(V.views, { n: compact.format(v.views) })}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </aside>
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
