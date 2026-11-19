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
