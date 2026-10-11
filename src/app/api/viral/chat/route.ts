import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { missingSlots, userAccounts, userPlan, zernioProfileId } from "@/lib/social";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { tiktokTrends, tiktokTrendsEnabled, type TikTokHashtag } from "@/lib/tiktok-trends";
import { trendingVideos, youtubeEnabled, type TrendingVideo } from "@/lib/youtube";
import { topPosts, zernioEnabled } from "@/lib/zernio";

// Chat « analyste viral » : Claude cherche les tendances du moment sur le web,
// montre les Shorts en tendance (YouTube), lit les comptes connectés et les
// vidéos du créateur, puis conseille la prochaine vidéo à générer. Réponse en
// flux NDJSON : text, status, videos, sources, error, done.
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = 40;
const HISTORY_MESSAGES = 20;
const MAX_TURNS = 8;
const REGION: Record<Locale, string> = { fr: "FR", en: "US", es: "ES" };

const SYSTEM = `You are TwinPost's virality analyst. TwinPost lets creators replace a person in a filmed clip with any character from a photo (Genjutsu engine): the moves, set, camera and sound stay; only the character changes. Your job is to help the creator decide which video to generate next and how to post it on TikTok, Instagram Reels and YouTube Shorts.

How to work:
- Trends move every day. For any question about what is viral or what to make, research before answering. For TikTok, call tiktok_trends first: the real trending hashtags of TikTok's Creative Center in the creator's country, with views and direction. Use youtube_trending to show real trending Shorts. Use web_search for news and trend reports from the last 7 to 14 days (formats, memes, sounds, characters, events), and to explain a hashtag you do not know. Prefer recent sources and say how recent they are.
- Many trending hashtags are characters (anime, games, films, series): that is exactly what TikTok creators put into a video with TwinPost. Say which trending characters fit a character swap and which kind of clip suits them.
- When the creator asks about their own accounts or results, call my_accounts. To know what they already made and which slots of their posting schedule still need a video, call my_videos.
- End with concrete ideas made for TwinPost, ranked by expected virality with the reason: the kind of source clip to film or pick (scene, action, 5 to 15 seconds), the character to swap in, the hook in the first second, a caption with 3 to 5 hashtags, and the best platform and time to post.
- Be direct and specific: short sections, bullet lists, no filler. Answer in the creator's language.
- Limits: no minors, no sexual content, nothing that would make people believe a real person said or did something harmful. Remind the creator to keep the AI-content label on (TwinPost sets it automatically when it publishes).`;

const TrendingInput = z.object({
  region_code: z.string().regex(/^[A-Za-z]{2}$/),
  shorts_only: z.boolean(),
  limit: z.number().int().min(1).max(12),
});
const TikTokInput = z.object({
  country_code: z.string().regex(/^[A-Za-z]{2}$/),
  period: z.enum(["7", "30"]),
  only_new: z.boolean(),
  limit: z.number().int().min(1).max(30),
});
const EmptyInput = z.object({});

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 6 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
  {
    name: "tiktok_trends",
    description:
      "Trending hashtags on TikTok right now in a country, from TikTok's Creative Center: rank, posts, views, industries, direction (up or down) and daily interest over the period. Use only_new to get hashtags that just entered the ranking. The creator sees them under your answer.",
    input_schema: {
      type: "object",
      properties: {
        country_code: { type: "string", description: "ISO 3166-1 alpha-2 country code, e.g. FR, US, ES." },
        period: { type: "string", enum: ["7", "30"], description: "Window in days." },
        only_new: { type: "boolean", description: "Only hashtags that recently entered the ranking." },
        limit: { type: "integer", description: "Number of hashtags to return, 1 to 30." },
      },
      required: ["country_code", "period", "only_new", "limit"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "youtube_trending",
    description:
      "Most popular YouTube videos right now in a country (official YouTube chart), with views, likes, length and link. Use shorts_only to keep vertical Shorts (3 minutes or less). The creator sees the videos as cards under your answer.",
    input_schema: {
      type: "object",
      properties: {
        region_code: { type: "string", description: "ISO 3166-1 alpha-2 country code, e.g. FR, US, ES." },
        shorts_only: { type: "boolean", description: "Keep only Shorts (3 minutes or less)." },
        limit: { type: "integer", description: "Number of videos to return, 1 to 12." },
      },
      required: ["region_code", "shorts_only", "limit"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "my_accounts",
    description:
      "The creator's connected social accounts (platform, username, followers) and their most viewed recent posts with views, likes, comments and shares.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "my_videos",
    description:
      "The creator's recent TwinPost videos (date, length, who was replaced) and their posting schedule: upcoming slots that still have no video in the next 7 days.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
    eager_input_streaming: true,
  },
];

type Send = (event: Record<string, unknown>) => void;

async function runTool(name: string, input: unknown, userId: string, send: Send): Promise<string> {
  if (name === "tiktok_trends") {
    const parsed = TikTokInput.safeParse(input);
    if (!parsed.success) return JSON.stringify({ error: "invalid input" });
    if (!tiktokTrendsEnabled()) return JSON.stringify({ error: "TikTok trends are not available right now." });
    const hashtags: TikTokHashtag[] = (
      await tiktokTrends({
        countryCode: parsed.data.country_code,
        period: parsed.data.period,
        onlyNew: parsed.data.only_new,
      })
    ).slice(0, parsed.data.limit);
    send({ type: "hashtags", items: hashtags });
    return JSON.stringify(hashtags);
  }
  if (name === "youtube_trending") {
    const parsed = TrendingInput.safeParse(input);
    if (!parsed.success) return JSON.stringify({ error: "invalid input" });
    if (!youtubeEnabled()) return JSON.stringify({ error: "YouTube trending is not available right now." });
    const videos: TrendingVideo[] = await trendingVideos({
      regionCode: parsed.data.region_code,
      shortsOnly: parsed.data.shorts_only,
      limit: parsed.data.limit,
    });
    send({ type: "videos", items: videos });
    return JSON.stringify(
      videos.map(({ title, channel, views, likes, comments, seconds, publishedAt, url }) => ({
        title,
        channel,
        views,
        likes,
        comments,
        seconds,
        publishedAt,
        url,
      })),
    );
  }
  if (!EmptyInput.safeParse(input).success) return JSON.stringify({ error: "invalid input" });
  if (name === "my_accounts") {
    if (!zernioEnabled()) return JSON.stringify({ error: "Account connection is not available yet." });
    const accounts = await userAccounts(userId);
    if (!accounts.length) {
      return JSON.stringify({ accounts: [], note: "No account connected. The creator can connect them in Planning." });
    }
    const profileId = await zernioProfileId(userId, false);
    const posts = profileId ? await topPosts(profileId) : null;
    return JSON.stringify({
      accounts: accounts.map(({ platform, username, followers }) => ({ platform, username, followers })),
      topPosts: posts ?? "Post statistics are not available.",
    });
  }
  if (name === "my_videos") {
    const { data } = await createAdminClient()
      .from("generations")
      .select("created_at, duration_seconds, metadata")
      .eq("user_id", userId)
      .eq("kind", "swap")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);
    const plan = await userPlan(userId);
    const missing = plan.saved ? await missingSlots(userId, plan, 7) : [];
    return JSON.stringify({
      videos: (data ?? []).map((g) => {
        const meta = (g.metadata ?? {}) as { target?: string; instructions?: string };
        return {
          date: g.created_at.slice(0, 10),
          seconds: g.duration_seconds,
          replaced: meta.target ?? null,
          instructions: meta.instructions ?? null,
        };
      }),
      schedule: plan.saved
        ? { timezone: plan.timezone, slotsWithoutVideoNext7Days: missing.map((d) => d.toISOString()) }
        : "No posting schedule set yet.",
    });
  }
  return JSON.stringify({ error: `unknown tool ${name}` });
}

// Fil gardé en base : texte seul (les blocs d'outils ne sont pas rejoués).
function historyText(role: string, content: string) {
  if (role === "user") return content;
  try {
    return (JSON.parse(content) as { text?: string }).text ?? "";
  } catch {
    return content;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("unauthorized", { status: 401 });
  const userId = auth.claims.sub;

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) return new Response("empty", { status: 400 });

  const admin = createAdminClient();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("viral_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", today.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return new Response("limit", { status: 429 });

  const { data: past } = await admin
    .from("viral_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  const history: Anthropic.Beta.BetaMessageParam[] = (past ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: historyText(m.role, m.content) }))
    .filter((m) => m.content);
  while (history[0]?.role === "assistant") history.shift();

  await admin.from("viral_messages").insert({ user_id: userId, role: "user", content: message });

  const locale = await getLocale();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: "user", content: message },
    {
      role: "system",
      content: `Today is ${new Date().toISOString().slice(0, 10)}. The creator's site language is "${locale}"; default country for trends: ${REGION[locale]}.`,
    },
  ];

  const encoder = new TextEncoder();
  const client = new Anthropic();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let text = "";
      // Pages citées par la réponse ; à défaut, premiers résultats de recherche.
      const cited = new Map<string, string>();
      const sources = new Map<string, string>();
      const videos: TrendingVideo[] = [];
      const hashtags: TikTokHashtag[] = [];
      const sendTracked: Send = (event) => {
        if (event.type === "videos") videos.push(...(event.items as TrendingVideo[]));
        if (event.type === "hashtags") hashtags.push(...(event.items as TikTokHashtag[]));
        send(event);
      };
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          let turnText = false;
          const response = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 32000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "medium" },
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
            tools: TOOLS,
            messages,
          });
          for await (const event of response) {
            if (event.type === "content_block_start") {
              const block = event.content_block;
              if (block.type === "server_tool_use" || block.type === "tool_use") {
                send({ type: "status", tool: block.name });
              } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
                for (const result of block.content) sources.set(result.url, result.title);
              }
            } else if (
              event.type === "content_block_delta" &&
              event.delta.type === "citations_delta" &&
              event.delta.citation.type === "web_search_result_location"
            ) {
              cited.set(event.delta.citation.url, event.delta.citation.title ?? event.delta.citation.url);
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              // Texte d'un nouveau tour : séparé du précédent.
              const piece = !turnText && text && !text.endsWith("\n") ? `\n\n${event.delta.text}` : event.delta.text;
              turnText = true;
              text += piece;
              send({ type: "text", text: piece });
            }
          }
          const final = await response.finalMessage();
          if (final.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: final.content });
            continue;
          }
          const toolUses = final.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
          );
          if (final.stop_reason !== "tool_use" || !toolUses.length) break;
          messages.push({ role: "assistant", content: final.content });
          const results = await Promise.all(
            toolUses.map(async (tool): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              try {
                return {
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: await runTool(tool.name, tool.input, userId, sendTracked),
                };
              } catch (e) {
                console.error("viral chat: outil", tool.name, e instanceof Error ? e.message : e);
                return { type: "tool_result", tool_use_id: tool.id, is_error: true, content: "Tool failed." };
              }
            }),
          );
          messages.push({ role: "user", content: results });
        }
        const sourceList = [...(cited.size ? cited : sources)].slice(0, 8).map(([url, title]) => ({ url, title }));
        if (sourceList.length) send({ type: "sources", items: sourceList });
        if (text) {
          await admin.from("viral_messages").insert({
            user_id: userId,
            role: "assistant",
            content: JSON.stringify({ text, sources: sourceList, videos, hashtags }),
          });
        }
        send({ type: "done" });
      } catch (e) {
        console.error("viral chat", e instanceof Error ? e.message : e);
        send({ type: "error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
