"use client";

import { Clapperboard, X } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { SWAP_INPUTS_BUCKET, SWAP_MAX_BYTES, SWAP_VIDEO_TYPES } from "@/lib/generation";
import type { StyleReference } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";
import { analyzeReference } from "./reference-actions";

// Bouton du mode Director : dépose une vidéo de référence et en fait
// analyser le style.
export function ReferenceButton({
  userId,
  busy,
  onBusy,
  onReference,
  onError,
}: {
  userId: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onReference: (reference: StyleReference & { referencePath: string }) => void;
  onError: (message: string | null) => void;
}) {
  const [supabase] = useState(createClient);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    onError(null);
    if (!SWAP_VIDEO_TYPES.includes(file.type)) return onError(t.generateErrors.swapFormat);
    if (file.size > SWAP_MAX_BYTES) return onError(t.generateErrors.swapTooBig);

    onBusy(true);
    const path = `${userId}/ref-${crypto.randomUUID()}.${file.name.split(".").pop() ?? "mp4"}`;
    const { error } = await supabase.storage
      .from(SWAP_INPUTS_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (error) {
      onBusy(false);
      return onError(t.generateErrors.swapUpload);
    }
    const res = await analyzeReference({ videoPath: path });
    onBusy(false);
    if (res.error !== undefined) return onError(res.error);
    onReference(res.data);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={SWAP_VIDEO_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title={t.studio.referenceHint}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-text disabled:opacity-60"
      >
        <Clapperboard className="size-4" />
        <span className="hidden sm:inline">
          {busy ? t.studio.referenceAnalyzing : t.studio.reference}
        </span>
      </button>
    </>
  );
}

// Style de référence retenu, affiché au-dessus de la zone de saisie.
export function ReferenceBanner({
  reference,
  onRemove,
}: {
  reference: StyleReference;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
      <Clapperboard className="mt-0.5 size-4 shrink-0 text-accent-light" />
      <p className="min-w-0 flex-1">
        <span className="font-medium text-accent-light">{t.studio.referenceLabel} · </span>
        <span className="text-muted">{reference.summary}</span>
      </p>
      <button
        type="button"
        onClick={onRemove}
        title={t.studio.referenceRemove}
        aria-label={t.studio.referenceRemove}
        className="text-muted hover:text-text"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
