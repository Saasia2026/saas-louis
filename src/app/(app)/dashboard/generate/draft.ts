// Projet du studio gardé dans le navigateur (IndexedDB, fichiers compris) :
// un visiteur prépare sa vidéo sans compte, se connecte au moment de
// générer, et la retrouve telle quelle ; idem au retour de la page Crédits.

export type DraftFile = { file: File; path?: string; seconds?: number; start?: number };

export type StudioDraft = {
  video: DraftFile;
  characters: { image: DraftFile; extras: DraftFile[]; target: string }[];
  decor: DraftFile | null;
  mode: "replace" | "transfer";
  hd: boolean;
  fidelity: boolean;
  instructions: string;
  length: number | null;
  savedAt: number;
};

const DB = "twinpost-studio";
const STORE = "drafts";
const KEY = "current";
// Au-delà, un projet abandonné ne revient plus.
const MAX_AGE_MS = 3 * 24 * 60 * 60_000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = act(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(draft: Omit<StudioDraft, "savedAt">) {
  try {
    await run("readwrite", (s) => s.put({ ...draft, savedAt: Date.now() }, KEY));
  } catch {
    // Navigation privée ou stockage refusé : le projet ne sera pas repris.
  }
}

export async function loadDraft(): Promise<StudioDraft | null> {
  try {
    const draft = await run<StudioDraft | undefined>("readonly", (s) => s.get(KEY));
    if (!draft || Date.now() - draft.savedAt > MAX_AGE_MS) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    // Rien à effacer.
  }
}
