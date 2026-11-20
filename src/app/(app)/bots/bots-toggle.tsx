"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { BOTS_EVENT, botsEnabled, setBotsEnabled } from "./bots-state";
import { ScoutFace } from "./creatures";

// Bouton de la barre du haut, visible seulement quand les bots sont
// désactivés : un clic les fait revenir.
export function BotsToggle() {
  const { t } = useI18n();
  const [off, setOff] = useState(false);
  useEffect(() => {
    const sync = () => setOff(!botsEnabled());
    sync();
    window.addEventListener(BOTS_EVENT, sync);
    return () => window.removeEventListener(BOTS_EVENT, sync);
  }, []);
  if (!off) return null;
  return (
    <button type="button" onClick={() => setBotsEnabled(true)} title={t.bots.enable} className="btn btn-ghost size-9 p-1.5">
      <ScoutFace still className="size-full" />
      <span className="sr-only">{t.bots.enable}</span>
    </button>
  );
}
