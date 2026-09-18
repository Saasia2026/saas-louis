"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Recharge les données serveur de la page à intervalle régulier.
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
