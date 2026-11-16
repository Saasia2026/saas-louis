"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { deleteInfluencer } from "./actions";
import { InfluencerCreator, type CreatedInfluencer } from "./creator";

// Page Influenceur IA : la création, puis la galerie des personnages déjà
// faits, chacun prêt à partir dans le studio.
export function InfluencerWorkspace({
  userId,
  credits,
  initial,
}: {
  userId: string;
  credits: number;
  initial: CreatedInfluencer[];
}) {
  const { t } = useI18n();
  const I = t.influencer;
  const [items, setItems] = useState(initial);
  const [, startDeleting] = useTransition();

  return (
    <>
      <InfluencerCreator
        userId={userId}
        credits={credits}
        onCreated={(created) => setItems((list) => [created, ...list])}
      />

      {items.length > 0 && (
        <section className="mt-16">
          <h2 className="font-headline text-3xl leading-none sm:text-4xl">{I.gallery}</h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => (
              <li key={item.id} className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent p-2 pt-10">
                  <Link
                    href={`/dashboard/generate?influencer=${item.id}`}
                    className="btn btn-accent min-w-0 flex-1 px-3 py-2 text-xs"
                  >
                    <span className="truncate">{I.useShort}</span>
                    <ArrowRight />
                  </Link>
                  <button
                    type="button"
                    title={I.delete}
                    onClick={() =>
                      startDeleting(async () => {
                        if (await deleteInfluencer(item.id)) {
                          setItems((list) => list.filter((x) => x.id !== item.id));
                        }
                      })
                    }
                    className="btn size-8 shrink-0 bg-black/50 p-0 text-white hover:bg-black/70"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">{I.delete}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
