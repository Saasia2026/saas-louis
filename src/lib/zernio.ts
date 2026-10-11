import "server-only";

// Zernio (ex-Late) : comptes connectés et publication programmée sur les
// réseaux, déjà validés auprès de TikTok, Meta et Google. Un profil Zernio par
// utilisateur regroupe ses comptes. Référence : docs.zernio.com, schémas exacts
// dans zernio.com/openapi.json.
const BASE_URL = "https://zernio.com/api/v1";

export const SOCIAL_PLATFORMS = ["tiktok", "instagram", "youtube", "facebook"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}

export function zernioEnabled() {
  return Boolean(process.env.ZERNIO_API_KEY);
}

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ZernioError(
      `Zernio ${init.method ?? "GET"} ${path} : ${response.status} ${text.slice(0, 300)}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export type SocialAccount = {
  id: string;
  platform: SocialPlatform;
  username: string;
  displayName: string;
  avatar: string | null;
  profileUrl: string | null;
  // Abonnés : seulement avec l'option analytics de Zernio.
  followers: number | null;
  needsReconnection: boolean;
};

type RawAccount = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string | null;
  profileUrl?: string;
  followersCount?: number;
  needsReconnection?: boolean;
  isActive: boolean;
};

export async function createProfile(name: string) {
  const { profile } = await call<{ profile: { _id: string } }>("/profiles", {
    method: "POST",
    body: JSON.stringify({ name: name.slice(0, 80) }),
  });
  return profile._id;
}

export async function listAccounts(profileId: string): Promise<SocialAccount[]> {
  const { accounts } = await call<{ accounts: RawAccount[] }>(
    `/accounts?profileId=${encodeURIComponent(profileId)}`,
  );
  return accounts
    .filter((a) => a.isActive && isSocialPlatform(a.platform))
    .map((a) => ({
      id: a._id,
      platform: a.platform as SocialPlatform,
      username: a.username ?? "",
      displayName: a.displayName ?? a.username ?? "",
      avatar: a.profilePicture ?? null,
      profileUrl: a.profileUrl ?? null,
      followers: typeof a.followersCount === "number" ? a.followersCount : null,
      needsReconnection: Boolean(a.needsReconnection),
    }));
}

// Lien OAuth du réseau ; Zernio renvoie ensuite vers redirectUrl avec
// connected, accountId et username (ou error).
export async function connectUrl(platform: SocialPlatform, profileId: string, redirectUrl: string) {
  const query = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const { authUrl } = await call<{ authUrl: string }>(`/connect/${platform}?${query}`);
  return authUrl;
}

export async function disconnectAccount(accountId: string) {
  await call(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

// Vidéo déposée chez Zernio (URL publique durable) : une URL signée de
// Supabase expirerait avant une publication programmée à plusieurs jours.
export async function uploadVideo(video: Blob, filename: string) {
  const { uploadUrl, publicUrl } = await call<{ uploadUrl: string; publicUrl: string }>(
    "/media/presign",
    {
      method: "POST",
      body: JSON.stringify({ filename, contentType: "video/mp4", size: video.size }),
    },
  );
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: video,
  });
  if (!put.ok) throw new ZernioError(`Zernio envoi de la vidéo : ${put.status}`, put.status);
  return publicUrl;
}

// Réglages par réseau. Le marquage « contenu IA » est exigé par les trois
// plateformes pour une vidéo de remplacement de personnage ; TikTok demande
// en plus l'aperçu et l'accord exprès du créateur (cochés dans le planning).
function platformData(platform: SocialPlatform, caption: string) {
  switch (platform) {
    case "tiktok":
      return {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        allowDuet: true,
        allowStitch: true,
        commercialContentType: "none",
        contentPreviewConfirmed: true,
        expressConsentGiven: true,
        videoMadeWithAi: true,
      };
    case "youtube":
      return {
        title: (caption.split("\n")[0] || "TwinPost").slice(0, 100),
        visibility: "public",
        madeForKids: false,
        containsSyntheticMedia: true,
      };
    case "instagram":
      return { shareToFeed: true, isAiGenerated: true };
    case "facebook":
      return undefined;
  }
}

export async function createScheduledPost(input: {
  caption: string;
  videoUrl: string;
  scheduledFor: Date;
  timezone: string;
  accounts: { id: string; platform: SocialPlatform }[];
  // Repris tel quel dans les réponses de Zernio : relie le post au nôtre.
  postId: string;
}) {
  const { post } = await call<{ post: { _id: string } }>("/posts", {
    method: "POST",
    headers: { "Idempotency-Key": input.postId },
    body: JSON.stringify({
      content: input.caption,
      mediaItems: [{ type: "video", url: input.videoUrl }],
      scheduledFor: input.scheduledFor.toISOString(),
      timezone: input.timezone,
      platforms: input.accounts.map((a) => ({
        platform: a.platform,
        accountId: a.id,
        platformSpecificData: platformData(a.platform, input.caption),
      })),
      metadata: { twinpostPostId: input.postId },
    }),
  });
  return post._id;
}

export type ZernioPostState = {
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled";
  platforms: { platform: string; status: string; url: string | null; error: string | null }[];
};

export async function getPost(postId: string): Promise<ZernioPostState> {
  const { post } = await call<{
    post: {
      status: ZernioPostState["status"];
      platforms?: { platform: string; status?: string; platformPostUrl?: string; errorMessage?: string }[];
    };
  }>(`/posts/${encodeURIComponent(postId)}`);
  return {
    status: post.status,
    platforms: (post.platforms ?? []).map((p) => ({
      platform: p.platform,
      status: p.status ?? "pending",
      url: p.platformPostUrl ?? null,
      error: p.errorMessage ?? null,
    })),
  };
}

export async function deletePost(postId: string) {
  await call(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
}

export type PostStats = {
  content: string;
  publishedAt: string | null;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

// Publications récentes des comptes du profil, les plus vues d'abord (y
// compris celles faites hors TwinPost). Option analytics de Zernio requise :
// sans elle, null.
export async function topPosts(profileId: string, limit = 15): Promise<PostStats[] | null> {
  try {
    const query = new URLSearchParams({ profileId, sortBy: "views", order: "desc", limit: String(limit) });
    const data = await call<{
      posts?: {
        content?: string;
        publishedAt?: string | null;
        platform?: string;
        platforms?: { platform?: string }[];
        analytics?: { views?: number; likes?: number; comments?: number; shares?: number };
      }[];
    }>(`/analytics?${query}`);
    return (data.posts ?? []).map((p) => ({
      content: (p.content ?? "").slice(0, 200),
      publishedAt: p.publishedAt ?? null,
      platform: p.platform ?? p.platforms?.[0]?.platform ?? "",
      views: p.analytics?.views ?? 0,
      likes: p.analytics?.likes ?? 0,
      comments: p.analytics?.comments ?? 0,
      shares: p.analytics?.shares ?? 0,
    }));
  } catch (e) {
    if (e instanceof ZernioError && (e.status === 402 || e.status === 403)) return null;
    throw e;
  }
}
