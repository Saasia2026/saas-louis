"use client";

import { useEffect, useState, useTransition } from "react";
import type { TwinModelView } from "@/lib/twin";
import { getTwinModel, regenerateTwinModel } from "./actions";

const POLL_INTERVAL_MS = 5_000;

const STEPS: Record<"waiting" | "image" | "mesh", string> = {
  waiting: "Préparation du modèle 3D…",
  image: "Photo de référence en cours…",
  mesh: "Modélisation 3D en cours (environ 3 min)…",
};

// Modèle 3D du jumeau, rotatif. Tant qu'il n'est pas prêt, la page
// interroge le serveur, ce qui fait aussi avancer la modélisation.
export function TwinModelViewer({ twinId, name }: { twinId: string; name: string }) {
  const [view, setView] = useState<TwinModelView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [relaunching, startRelaunch] = useTransition();

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await getTwinModel(twinId);
      if (!active) return;
      if (res.error !== undefined) {
        setError(res.error);
        return;
      }
      setView(res.data);
      if (res.data.status !== "ready" && res.data.status !== "failed") {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [twinId, round]);

  function relaunch() {
    startRelaunch(async () => {
      const res = await regenerateTwinModel(twinId);
      if (res.error !== undefined) {
        setError(res.error);
        return;
      }
      setView(null);
      setRound((r) => r + 1);
    });
  }

  const status = view?.status;

  return (
    <div>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-neon-purple/10 via-card to-card sm:aspect-[4/3]">
        {status === "ready" && view?.modelUrl ? (
          <model-viewer
            src={view.modelUrl}
            poster={view.imageUrl}
            alt={`Modèle 3D de ${name}`}
            camera-controls
            auto-rotate
            shadow-intensity="1"
            exposure="1.1"
            touch-action="pan-y"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            {view?.imageUrl && status !== "failed" && (
              // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
              <img
                src={view.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-contain opacity-30 blur-sm"
              />
            )}
            {error ? (
              <p className="relative text-sm text-neon-pink">{error}</p>
            ) : status === "failed" ? (
              <p className="relative text-sm text-neon-pink">
                La modélisation 3D a échoué.
              </p>
            ) : (
              <>
                <span className="relative size-10 animate-spin rounded-full border-2 border-white/15 border-t-neon-cyan" />
                <p className="relative text-sm text-muted">
                  {STEPS[status === "image" || status === "mesh" ? status : "waiting"]}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {(status === "ready" || status === "failed") && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">
            {status === "ready" ? "Fais-le tourner à la souris ou au doigt." : ""}
          </span>
          <button
            type="button"
            onClick={relaunch}
            disabled={relaunching}
            className="rounded-lg border border-white/20 px-3 py-1.5 font-semibold disabled:opacity-50"
          >
            {relaunching ? "Relance…" : "Refaire le modèle 3D"}
          </button>
        </div>
      )}
    </div>
  );
}
