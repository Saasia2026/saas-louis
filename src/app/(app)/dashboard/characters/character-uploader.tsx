"use client";

import { UserPlus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  ACCEPTED_CHARACTER_VIDEO_TYPES as ACCEPTED_TYPES,
  CHARACTER_VIDEOS_BUCKET,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_VIDEO_BYTES as MAX_VIDEO_BYTES,
} from "@/lib/character";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { createCharacter } from "./actions";

// Dépose une vidéo courte du sujet, puis demande à Sora d'en faire un
// personnage réutilisable.
export function CharacterUploader({ userId }: { userId: string }) {
  const [supabase] = useState(createClient);
  const { t } = useI18n();
  const C = t.characters;
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(next: File | null) {
    setError(null);
    if (!next) return setFile(null);
    if (!ACCEPTED_TYPES.includes(next.type)) {
      return setError(C.errors.format);
    }
    if (next.size > MAX_VIDEO_BYTES) {
      return setError(C.errors.tooBig);
    }
    setFile(next);
  }

  function submit() {
    if (!file || !name.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const path = `${userId}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "mp4"}`;
      const upload = await supabase.storage
        .from(CHARACTER_VIDEOS_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (upload.error) {
        setError(C.errors.upload);
        return;
      }
      const res = await createCharacter({ name: name.trim(), videoPath: path });
      if (res.error !== undefined) {
        setError(res.error);
        return;
      }
      setName("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="panel spotlight animate-fade-up p-6">
      <span className="flex size-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent-light">
        <UserPlus className="size-4" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{C.newTitle}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {C.newHint}
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="label">{C.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_CHARACTER_NAME_LENGTH}
            placeholder={C.namePlaceholder}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="label">{C.video}</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="field py-2 file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-3 file:px-3 file:py-1 file:text-sm file:text-text"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !file || !name.trim()}
          className="btn btn-accent w-full py-3"
        >
          {pending ? C.creating : C.create}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </section>
  );
}
