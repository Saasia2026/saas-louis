"use client";

import { Check, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

// Choix de la langue : enregistre le cookie puis recharge les données de la
// page dans la nouvelle langue.
export function LanguageSwitcher({ up = false }: { up?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.common.language}
        title={t.common.language}
        className={`btn btn-ghost gap-1.5 px-2.5 ${pending ? "opacity-60" : ""}`}
      >
        <Globe />
        <span className="text-xs font-semibold uppercase">{locale}</span>
      </button>
      {open && (
        <div className={`menu right-0 min-w-40 ${up ? "bottom-full mb-2" : "top-full mt-2"}`}>
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setOpen(false);
                if (l === locale) return;
                startTransition(async () => {
                  await setLocale(l);
                  router.refresh();
                });
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3"
            >
              <span className="w-6 text-xs font-semibold text-muted uppercase">{l}</span>
              <span className="flex-1">{LOCALE_NAMES[l]}</span>
              {l === locale && <Check className="size-4 text-accent-light" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
