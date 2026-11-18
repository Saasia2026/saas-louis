"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Modal, ModalClose } from "./media-library";

// Style de Restyle : identifiant envoyé au serveur, nom et image d'aperçu
// (voir listRestyleStyles).
export type StudioStyle = { id: string; name: string; previewUrl: string };

// Trois aperçus en éventail, comme des cartes tenues en main : ceux des côtés
// penchés et en retrait, celui du milieu devant et un peu plus grand. Au
// survol de la case, l'éventail s'ouvre un peu plus.
const FAN = [
  { rest: "-translate-x-[58%] -rotate-[14deg] scale-[0.86]", open: "group-hover:-translate-x-[72%] group-hover:-rotate-[20deg]", z: "z-0" },
  { rest: "translate-x-[58%] rotate-[14deg] scale-[0.86]", open: "group-hover:translate-x-[72%] group-hover:rotate-[20deg]", z: "z-0" },
  { rest: "", open: "group-hover:-translate-y-0.5 group-hover:scale-[1.04]", z: "z-10" },
];

function StyleFan({ styles, front }: { styles: StudioStyle[]; front?: StudioStyle | null }) {
  // Au milieu, devant : le style choisi, sinon le premier ; deux autres de
  // chaque côté.
  const middle = front ?? styles[0];
  const others = styles.filter((s) => s.id !== middle?.id);
  const cards = [others[0], others[1], middle];
  return (
    <span aria-hidden className="relative flex h-14 w-24 shrink-0 items-center justify-center">
      {cards.map((s, i) =>
        s ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.id}
            src={s.previewUrl}
            alt=""
            className={`absolute h-14 w-11 rounded-[10px] border-2 border-surface object-cover shadow-[0_6px_16px_-6px_rgb(0_0_0/0.7)] transition-transform duration-300 [transition-timing-function:var(--ease-out)] ${FAN[i].rest} ${FAN[i].open} ${FAN[i].z}`}
          />
        ) : null,
      )}
    </span>
  );
}

// Choix du style : une case qui ouvre la grille des styles, comme sur
// Higgsfield. Visible dans tous les modes. `onClear` retire le style.
export function StylePicker({
  styles,
  value,
  onChange,
  onClear,
}: {
  styles: StudioStyle[];
  value: StudioStyle | null;
  onChange: (style: StudioStyle) => void;
  onClear?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Trois aperçus en éventail tant qu'aucun style n'est choisi.
  const fan = styles.slice(0, 3);

  return (
    <div className="rounded-[1.25rem] bg-surface-2/60">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group flex w-full items-center gap-3 rounded-[1.25rem] border p-3 text-left transition-colors hover:border-line-strong ${
          value ? "border-line" : "border-dashed border-line-strong"
        }`}
      >
        {value ? (
          <>
            <StyleFan styles={styles.slice(0, 3)} front={value} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{value.name}</span>
              <span className="block text-xs text-muted">{t.studio.styleChange}</span>
            </span>
            {onClear && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Remove style"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onClear(); } }}
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-text"
              >
                <X className="size-4" />
              </span>
            )}
          </>
        ) : (
          <>
            <StyleFan styles={fan} />
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
