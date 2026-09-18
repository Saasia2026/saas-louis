"use client";

import { useState, useTransition } from "react";
import { MAX_TWIN_NAME_LENGTH } from "@/lib/twin";
import { deleteTwin, renameTwin } from "./actions";

export function TwinSettings({ twinId, name }: { twinId: string; name: string }) {
  const [draft, setDraft] = useState(name);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const changed = draft.trim() !== name && draft.trim().length > 0;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    startSave(async () => {
      const res = await renameTwin(twinId, draft);
      setNotice(res.error ?? "Nom enregistré.");
    });
  }

  function remove() {
    setNotice(null);
    startDelete(async () => {
      // En cas de succès, l'action redirige vers le tableau de bord.
      const res = await deleteTwin(twinId);
      if (res?.error !== undefined) {
        setNotice(res.error);
        setConfirming(false);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-card p-6">
      <h2 className="text-lg font-semibold">Réglages</h2>

      <form onSubmit={save} className="mt-4">
        <label htmlFor="twin-name" className="text-sm text-muted">
          Nom du jumeau
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="twin-name"
            value={draft}
            maxLength={MAX_TWIN_NAME_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-neon-purple"
          />
          <button
            type="submit"
            disabled={!changed || saving}
            className="rounded-lg border border-white/20 px-4 py-2 font-semibold disabled:opacity-40"
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-white/10 pt-6">
        {confirming ? (
          <div className="rounded-xl border border-neon-pink/40 bg-neon-pink/5 p-4">
            <p className="text-sm">
              Supprimer ce jumeau efface ses photos d&apos;entraînement, son modèle
              IA et son modèle 3D. Tes photos et vidéos déjà générées sont
              gardées. C&apos;est définitif.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="rounded-lg bg-neon-pink px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Oui, supprimer"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded-lg border border-white/20 px-4 py-2 font-semibold"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm font-semibold text-neon-pink hover:underline"
          >
            Supprimer ce jumeau
          </button>
        )}
      </div>

      {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
    </section>
  );
}
