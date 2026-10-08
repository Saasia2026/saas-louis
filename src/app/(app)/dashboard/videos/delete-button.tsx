"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { deleteGeneration } from "./actions";

const OVERLAY =
  "absolute top-2 right-2 z-10 size-7 bg-black/60 text-white/80 backdrop-blur hover:bg-red-600 hover:text-white";

export function DeleteButton({
  id,
  confirm,
  className = OVERLAY,
}: {
  id: string;
  confirm: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={confirm}
      title={confirm}
      className={`flex items-center justify-center rounded-full transition disabled:opacity-50 ${className}`}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(() => deleteGeneration(id));
      }}
    >
      <X className="size-4" />
    </button>
  );
}
