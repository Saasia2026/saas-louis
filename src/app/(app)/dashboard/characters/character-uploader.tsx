"use client";

import { useRef, useState, useTransition } from "react";
import {
  ACCEPTED_CHARACTER_VIDEO_TYPES as ACCEPTED_TYPES,
  CHARACTER_VIDEOS_BUCKET,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_VIDEO_BYTES as MAX_VIDEO_BYTES,
} from "@/lib/character";
import { createClient } from "@/lib/supabase/client";
import { createCharacter } from "./actions";

// Dépose une vidéo courte du sujet, puis demande à Sora d'en faire un
// personnage réutilisable.
export function CharacterUploader({ userId }: { userId: string }) {
  const [supabase] = useState(createClient);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(next: File | null) {
    setError(null);
    if (!next) return setFile(null);
    if (!ACCEPTED_TYPES.includes(next.type)) {
      return setError("Format accepté : MP4, MOV ou WebM.");
    }
    if (next.size > MAX_VIDEO_BYTES) {
      return setError("Vidéo trop lourde (50 Mo maximum).");
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
        setError("L'envoi de la vidéo a échoué.");
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
    <section className="rounded-2xl border border-white/10 p-5">
      <h2 className="font-display text-lg">Nouveau personnage</h2>
      <p className="mt-1 text-sm text-muted">
        Une vidéo courte du sujet (5 à 10 s suffisent), bien éclairée, sans autre visage.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Nom</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_CHARACTER_NAME_LENGTH}
            placeholder="Ex. : Nino"
            className="rounded-xl border border-white/10 bg-card px-4 py-2.5 outline-none focus:border-neon-purple"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Vidéo</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="rounded-xl border border-white/10 bg-card px-4 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-text"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !file || !name.trim()}
          className="rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Création du personnage… (~30 s)" : "Créer le personnage"}
        </button>
        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
    </section>
  );
}
