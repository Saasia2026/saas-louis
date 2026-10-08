"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { deleteGeneration } from "./actions";

export function DeleteButton({ id, confirm }: { id: string; confirm: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={confirm}
      className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur transition hover:bg-red-600 hover:text-white disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(() => deleteGeneration(id));
      }}
    >
      <X className="size-4" />
    </button>
  );
}
