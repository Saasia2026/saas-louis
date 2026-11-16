// Ce que le fil garde dans ce navigateur : j'aime, vidéos enregistrées,
// astuce déjà vue, défilement automatique. Tout passe par try/catch : en
// navigation privée le stockage peut manquer, et le fil marche sans.
export const FEED_KEYS = {
  likes: "feed:likes",
  saves: "feed:saves",
  hinted: "feed:hinted",
  auto: "feed:auto",
} as const;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function readSet(key: string): Set<string> {
  try {
    const list: unknown = JSON.parse(read(key) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeSet(key: string, set: Set<string>) {
  write(key, JSON.stringify([...set]));
}

export const readFlag = (key: string) => read(key) === "1";
export const writeFlag = (key: string, on: boolean) => write(key, on ? "1" : "0");

// Choix du son pour toute la visite : null tant que personne n'a touché le
// fil (il démarre muet, contrainte des navigateurs), puis vrai ou faux. Le
// fil peut être fermé et rouvert sans redemander.
let sound: boolean | null = null;
export const sessionSound = () => sound;
export function setSessionSound(on: boolean | null) {
  sound = on;
}
