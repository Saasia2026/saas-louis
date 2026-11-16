"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Modal, ModalClose } from "./media-library";

// Style de Restyle : identifiant envoyé au serveur, nom et image d'aperçu
// (voir listRestyleStyles).
export type StudioStyle = { id: string; name: string; previewUrl: string };

// Choix du style (mode Restyle) : une case qui ouvre la grille des styles.
// Une fois choisi, la case montre son aperçu et son nom.
export function StylePicker({
  styles,
  value,
  onChange,
}: {
  styles: StudioStyle[];
  value: StudioStyle | null;
  onChange: (style: StudioStyle) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Trois aperçus en éventail tant qu'aucun style n'est choisi.
  const fan = styles.slice(0, 3);

  return (
    <div className="px-4 pb-2">
      <p className="text-xs text-faint">{t.studio.styleLabel}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2 flex w-full items-center gap-3 rounded-2xl border bg-surface-2/50 p-3 text-left transition-colors hover:border-line-strong ${
          value ? "border-line" : "border-dashed border-line-strong"
        }`}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.previewUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{value.name}</span>
              <span className="block text-xs text-muted">{t.studio.styleChange}</span>
            </span>
          </>
        ) : (
          <>
            <span className="flex shrink-0 -space-x-3">
              {fan.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={s.id}
                  src={s.previewUrl}
                  alt=""
                  className="size-12 rounded-xl border-2 border-surface object-cover"
                />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.studio.styleSelect}</span>
              <span className="block text-xs text-muted">{t.studio.styleHint}</span>
            </span>
          </>
        )}
      </button>

      {open && (
        <Modal label={t.studio.styleSelect} onClose={() => setOpen(false)} className="sm:max-w-3xl">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold">{t.studio.styleSelect}</h2>
            <ModalClose onClose={() => setOpen(false)} />
          </div>
          <ul className="grid grid-cols-2 gap-3 overflow-y-auto px-5 pb-5 sm:grid-cols-3">
            {styles.map((s) => {
              const selected = value?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(s);
                      setOpen(false);
                    }}
                    className={`group block w-full overflow-hidden rounded-2xl border text-left transition-colors ${
                      selected ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-line hover:border-line-strong"
                    }`}
                  >
                    <span className="relative block aspect-square overflow-hidden bg-surface-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.previewUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.05]"
                      />
                      {selected && (
                        <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-accent text-white">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="block truncate px-3 py-2.5 text-sm font-medium">{s.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </div>
  );
}
