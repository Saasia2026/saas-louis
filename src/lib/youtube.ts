import "server-only";

// Vidéos en tendance sur YouTube (API Data v3, « mostPopular » par pays) :
// la seule source officielle et gratuite de vidéos virales du moment.
export function youtubeEnabled() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export type TrendingVideo = {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  views: number;
  likes: number | null;
  comments: number | null;
  seconds: number;
  thumbnail: string;
  url: string;
};

// Durée ISO 8601 (PT1M5S) en secondes.
function seconds(duration: string) {
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

// Shorts : 3 min au plus (limite YouTube depuis octobre 2024).
export async function trendingVideos(input: { regionCode: string; shortsOnly: boolean; limit: number }) {
  const query = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    regionCode: input.regionCode.toUpperCase(),
    maxResults: "50",
    key: process.env.YOUTUBE_API_KEY!,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${query}`, {
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new Error(`YouTube : ${response.status}`);
  const data = (await response.json()) as {
    items?: {
      id: string;
      snippet: {
        title: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: Record<string, { url: string } | undefined>;
      };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    }[];
  };
  const videos: TrendingVideo[] = (data.items ?? []).map((v) => {
    const length = seconds(v.contentDetails.duration);
    return {
      id: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      views: Number(v.statistics.viewCount ?? 0),
      likes: v.statistics.likeCount ? Number(v.statistics.likeCount) : null,
      comments: v.statistics.commentCount ? Number(v.statistics.commentCount) : null,
      seconds: length,
      thumbnail:
        v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.medium?.url ?? v.snippet.thumbnails.default?.url ?? "",
      url: length <= 180 ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
    };
  });
  return videos.filter((v) => !input.shortsOnly || (v.seconds > 0 && v.seconds <= 180)).slice(0, input.limit);
}
