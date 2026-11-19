// Bots affichés ou non, choix gardé dans le navigateur. Le bouton de la
// barre du haut et l'aquarium s'écoutent par un événement de la fenêtre.
export const BOTS_EVENT = "twinpost-bots-change";
const KEY = "twinpost-bots";

export function botsEnabled() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setBotsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(BOTS_EVENT));
}

// « Analyser » d'un rendu : Hook ouvre sa discussion et analyse ce rendu.
// La demande attend ici si l'aquarium n'est pas encore monté (bots
// désactivés : ils sont réactivés pour l'occasion).
export const BOTS_ANALYZE_EVENT = "twinpost-bots-analyze";
export type AnalyzeRequest = { generationId: string; url?: string; nonce: number };
let pending: AnalyzeRequest | null = null;

export function askBotsToAnalyze(generationId: string, url?: string) {
  pending = { generationId, url, nonce: Date.now() };
  if (!botsEnabled()) setBotsEnabled(true);
  window.dispatchEvent(new Event(BOTS_ANALYZE_EVENT));
}

export function takeAnalyzeRequest() {
  const request = pending;
  pending = null;
  return request;
}
