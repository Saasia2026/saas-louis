"use client";

import { RefreshCw } from "lucide-react";
import Link, { useLinkStatus } from "next/link";

// Bouton « autres tendances » : page suivante de la colonne, sans remonter
// l'écran ni empiler l'historique.
export function MoreTrends({ page, label }: { page: number; label: string }) {
  return (
    <Link
      href={`/dashboard/viral?trends=${page}`}
      replace
      scroll={false}
      prefetch={false}
      title={label}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-lg text-accent-hot transition-colors hover:bg-surface-2"
    >
      <Spin />
    </Link>
  );
}

function Spin() {
  const { pending } = useLinkStatus();
  return <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />;
}
