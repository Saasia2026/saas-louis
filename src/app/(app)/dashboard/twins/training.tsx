import "server-only";
import { applyTrainingResult, createReplicate, errorMessage } from "@/lib/replicate";

// Filet de sécurité quand le webhook ne peut pas arriver (dev local) ou
// s'est perdu : on demande directement l'état de l'entraînement à Replicate.
export async function syncTraining(twin: {
  status: string;
  replicate_training_id: string | null;
}) {
  if (twin.status !== "training" || !twin.replicate_training_id) return false;
  try {
    await applyTrainingResult(
      await createReplicate().trainings.get(twin.replicate_training_id),
    );
    return true;
  } catch (e) {
    console.error("sync training", errorMessage(e));
    return false;
  }
}

// Estimation basée sur une durée typique de 25 minutes, plafonnée à 95 %.
const ESTIMATED_TRAINING_MS = 25 * 60_000;

// Rendu serveur à chaque requête : l'heure courante est celle de la requête.
function msSince(iso: string | null) {
  return iso ? Date.now() - new Date(iso).getTime() : 0;
}

export function TrainingProgress({ startedAt }: { startedAt: string | null }) {
  const elapsed = msSince(startedAt);
  const ratio = Math.min(elapsed / ESTIMATED_TRAINING_MS, 0.95);
  const minutesLeft = Math.max(
    1,
    Math.ceil((ESTIMATED_TRAINING_MS - elapsed) / 60_000),
  );

  return (
    <>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-cyan transition-all"
          style={{ width: `${Math.max(ratio, 0.03) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {ratio < 0.95
          ? `Encore environ ${minutesLeft} min`
          : "Presque terminé…"}
      </p>
    </>
  );
}
