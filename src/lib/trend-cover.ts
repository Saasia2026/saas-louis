// Couvertures TikTok servies par notre serveur (voir api/trends/cover) : liens
// signés, refusés selon le pays ou le réseau du visiteur quand on les charge
// directement.
const TIKTOK_IMAGE_HOST = /(^|\.)tiktokcdn(-us|-eu)?\.com$/;

export function isTikTokImage(url: URL) {
  return url.protocol === "https:" && TIKTOK_IMAGE_HOST.test(url.hostname);
}

export function coverSrc(url: string) {
  return `/api/trends/cover?u=${encodeURIComponent(url)}`;
}
