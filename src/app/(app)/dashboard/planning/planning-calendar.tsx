"use client";

import { CircleAlert, ExternalLink, Plus, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { SocialPlatform } from "@/lib/zernio";
import { cancelPost, schedulePost, type ScheduleState } from "./actions";
import { ConfirmButton } from "./confirm-button";
import { PlatformBadge } from "./platform-badge";

export type CalendarPost = {
  id: string;
  status: "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled";
  caption: string;
  accountIds: string[];
  generationId: string | null;
  links: { platform: string; url: string }[];
};
export type CalendarEntry = { at: string; post?: CalendarPost };
export type CalendarVideo = { id: string; mediaUrl: string; date: string };
export type CalendarAccount = { id: string; platform: SocialPlatform; username: string; needsReconnection: boolean };

const STATUS_STYLE: Record<CalendarPost["status"], string> = {
  scheduled: "border-accent/30 bg-accent-soft text-accent-light",
  publishing: "border-accent/30 bg-accent-soft text-accent-light",
  published: "border-success/30 bg-success/10 text-success",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  failed: "border-danger/30 bg-danger/10 text-danger",
  cancelled: "border-line bg-surface-2 text-muted",
};

// Créneaux des deux prochaines semaines, jour par jour : la vidéo programmée,
// ou un créneau vide à remplir avec une vidéo terminée.
export function PlanningCalendar({
  entries,
  videos,
  accounts,
  defaultAccountIds,
  timezone,
  enabled,
}: {
  entries: CalendarEntry[];
  videos: CalendarVideo[];
  accounts: CalendarAccount[];
  defaultAccountIds: string[];
  timezone: string;
  enabled: boolean;
}) {
  const { t, locale } = useI18n();
  const P = t.planning;
  const intl = INTL_LOCALES[locale];
  const [open, setOpen] = useState<string | null>(null);
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(
      new Date(iso),
    );
  const timeOf = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const days: { label: string; entries: CalendarEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayOf(entry.at);
    const last = days[days.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  if (!days.length) {
    return <p className="panel p-6 text-sm text-muted">{P.noSlots}</p>;
  }

  return (
    <ol className="space-y-6">
      {days.map((day) => (
        <li key={day.label}>
          <p className="text-sm font-semibold first-letter:uppercase">{day.label}</p>
          <ul className="mt-2 space-y-2">
            {day.entries.map((entry) => {
              const post = entry.post;
              const video = post?.generationId ? videos.find((v) => v.id === post.generationId) : undefined;
              return (
                <li key={entry.at + (post?.id ?? "")} className="panel p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-12 shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">{timeOf(entry.at)}</span>
                    {post ? (
                      <>
                        {video && (
                          <video
                            src={`${video.mediaUrl}#t=0.1`}
                            preload="metadata"
                            muted
                            playsInline
                            disablePictureInPicture
                            disableRemotePlayback
                            className="h-12 w-7 shrink-0 rounded-md bg-black object-cover"
                          />
                        )}
                        <p className="min-w-0 flex-1 truncate text-sm text-muted">{post.caption || "—"}</p>
                        <span className="flex gap-1">
                          {post.accountIds.map((id) => {
                            const account = accounts.find((a) => a.id === id);
                            return account ? (
                              <PlatformBadge key={id} platform={account.platform} className="size-6" />
                            ) : null;
                          })}
                        </span>
                        <span className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[post.status]}`}>
                          {P.status[post.status]}
                        </span>
                        {post.links.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost px-2 py-1 text-xs"
                          >
                            <ExternalLink />
                            {P.platforms[l.platform as SocialPlatform] ?? l.platform}
                          </a>
                        ))}
                        {post.status === "scheduled" && (
                          <form action={cancelPost}>
                            <input type="hidden" name="id" value={post.id} />
                            <ConfirmButton confirm={P.cancelConfirm} className="btn btn-ghost px-2 py-1 text-xs">
                              <X />
                              {P.cancelPost}
                            </ConfirmButton>
                          </form>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="flex flex-1 items-center gap-1.5 text-sm font-medium text-amber-300">
                          <CircleAlert className="size-4" />
                          {P.slotMissing}
                        </span>
                        <button
                          type="button"
                          disabled={!enabled}
                          onClick={() => setOpen(open === entry.at ? null : entry.at)}
                          className="btn btn-secondary px-3 py-1.5 text-xs"
                        >
                          <Plus />
                          {P.pickVideo}
                        </button>
                      </>
                    )}
                  </div>
                  {open === entry.at && !post && (
                    <SlotForm
                      slot={entry.at}
                      videos={videos}
                      accounts={accounts}
                      defaultAccountIds={defaultAccountIds}
                      onDone={() => setOpen(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function SlotForm({
  slot,
  videos,
  accounts,
  defaultAccountIds,
  onDone,
}: {
  slot: string;
  videos: CalendarVideo[];
  accounts: CalendarAccount[];
  defaultAccountIds: string[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const P = t.planning;
  const [state, action, pending] = useActionState<ScheduleState, FormData>(schedulePost, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const usable = accounts.filter((a) => !a.needsReconnection);
  const checked = (id: string) => (defaultAccountIds.length ? defaultAccountIds.includes(id) : true);

  if (!videos.length) return <p className="mt-3 text-sm text-muted">{P.noVideos}</p>;
  if (!usable.length) return <p className="mt-3 text-sm text-muted">{P.connectFirst}</p>;

  return (
    <form action={action} className="mt-4 space-y-4 border-t border-line pt-4">
      <input type="hidden" name="slot" value={slot} />
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {videos.map((v, i) => (
          <label key={v.id} className="group relative cursor-pointer">
            <input type="radio" name="generationId" value={v.id} defaultChecked={i === 0} className="peer sr-only" />
            <video
              src={`${v.mediaUrl}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              className="aspect-[9/16] w-full rounded-lg border-2 border-transparent bg-black object-cover transition-colors peer-checked:border-accent"
            />
            <span className="mt-1 block truncate text-[0.6875rem] text-faint">{v.date}</span>
          </label>
        ))}
      </div>
      <label className="block text-sm">
        <span className="label">{P.caption}</span>
        <textarea name="caption" rows={3} maxLength={2200} placeholder={P.captionPlaceholder} className="field mt-1" />
      </label>
      <fieldset className="flex flex-wrap gap-2">
        {usable.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-sm has-[:checked]:border-accent/50">
            <input type="checkbox" name="account" value={a.id} defaultChecked={checked(a.id)} className="size-4 accent-[var(--accent)]" />
            <PlatformBadge platform={a.platform} className="size-5" />
            {a.username}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-[var(--accent)]" />
        {P.consent}
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent">
        {pending ? P.scheduling : P.schedule}
      </button>
    </form>
  );
}
