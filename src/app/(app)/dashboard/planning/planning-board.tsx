"use client";

import { BellRing, Clapperboard, ExternalLink, Plus, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { ALERT_DAY_OPTIONS, MAX_PLAN_TIMES, dayKey } from "@/lib/posting-plan";
import type { SocialPlatform } from "@/lib/zernio";
import { cancelPost, connectAccount, disconnectAccount, savePlan, schedulePost, type ScheduleState } from "./actions";
import { ConfirmButton } from "./confirm-button";
import { PlatformBadge } from "./platform-badge";

export type BoardPost = {
  id: string;
  status: "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled";
  caption: string;
  accountIds: string[];
  generationId: string | null;
  links: { platform: string; url: string }[];
};
export type BoardEntry = { at: string; post?: BoardPost };
export type BoardVideo = { id: string; mediaUrl: string; date: string };
export type BoardAccount = {
  id: string;
  platform: SocialPlatform;
  username: string;
  avatar: string | null;
  needsReconnection: boolean;
};
export type BoardPlan = {
  weekdays: number[];
  times: string[];
  timezone: string;
  accountIds: string[];
  alertDays: number;
  alertEmail: boolean;
};

const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "youtube", "facebook"];
// Lundi d'abord.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const STATUS_STYLE: Record<BoardPost["status"], string> = {
  scheduled: "bg-accent text-white",
  publishing: "bg-accent text-white",
  published: "bg-emerald-500 text-white",
  partial: "bg-amber-400 text-black",
  failed: "bg-rose-600 text-white",
  cancelled: "bg-zinc-600 text-white",
};

export function PlanningBoard({
  days,
  entries,
  videos,
  accounts,
  plan,
  timezones,
  enabled,
  missingSoon,
}: {
  // Les jours affichés (AAAA-MM-JJ), même sans créneau : un vrai calendrier.
  days: string[];
  entries: BoardEntry[];
  videos: BoardVideo[];
  accounts: BoardAccount[];
  plan: BoardPlan;
  timezones: readonly string[];
  enabled: boolean;
  missingSoon: number;
}) {
  const { t, locale } = useI18n();
  const P = t.planning;
  const intl = INTL_LOCALES[locale];
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  const byDay = new Map<string, BoardEntry[]>();
  for (const entry of entries) {
    const key = dayKey(new Date(entry.at), plan.timezone);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }
  const dayLabel = (key: string) => {
    const date = new Date(`${key}T12:00:00Z`);
    return {
      weekday: new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "short" }).format(date),
      day: new Intl.DateTimeFormat(intl, { timeZone: "UTC", day: "numeric" }).format(date),
    };
  };
  const timeOf = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: plan.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const longDate = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeZone: plan.timezone, weekday: "long", day: "numeric", month: "long" }).format(
      new Date(iso),
    );

  const rhythm = `${WEEK.filter((d) => plan.weekdays.includes(d))
    .map((d) => P.weekdays[d])
    .join(", ")} · ${[...plan.times].sort().join(" · ")}`;

  return (
    <section className="mt-10 animate-fade-up">
      {/* Barre du planning : le rythme en une ligne, ce qu'il reste à remplir. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-headline text-3xl leading-none">{P.calendarTitle}</h2>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            aria-expanded={editing}
            className="flex items-center gap-2 rounded-full border border-line bg-surface-2/70 px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-text"
          >
            <Settings2 className="size-4" />
            <span className="tabular-nums">{rhythm}</span>
            <span className="text-faint">· {P.editRhythm}</span>
          </button>
        </div>
        {missingSoon > 0 && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-300">
              <BellRing className="size-4" />
              {fmt(P.toFill, { n: missingSoon })}
            </span>
            <Link href="/dashboard/generate" className="btn btn-hot">
              <Clapperboard />
              {P.createVideo}
            </Link>
          </div>
        )}
      </div>

      {editing && <RhythmEditor plan={plan} accounts={accounts} timezones={timezones} />}

      {accounts.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {accounts.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pr-1 pl-1.5 text-sm"
            >
              {a.avatar ? (
                // Photo du compte hébergée par le réseau : pas d'optimisation Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatar} alt="" className="size-6 rounded-full object-cover" />
              ) : (
                <PlatformBadge platform={a.platform} className="size-6" />
              )}
              <span className="font-medium">@{a.username}</span>
              {a.needsReconnection && <span className="text-xs text-amber-300">{P.reconnect}</span>}
              <form action={disconnectAccount}>
                <input type="hidden" name="accountId" value={a.id} />
                <ConfirmButton
                  confirm={P.disconnectConfirm}
                  className="flex size-6 items-center justify-center rounded-full text-faint hover:bg-surface-3 hover:text-text"
                >
                  <X className="size-3.5" />
                  <span className="sr-only">{P.disconnect}</span>
                </ConfirmButton>
              </form>
            </span>
          ))}
          {enabled &&
            PLATFORMS.map((platform) => (
              <form key={platform} action={connectAccount}>
                <input type="hidden" name="platform" value={platform} />
                <button
                  type="submit"
                  title={P.platforms[platform]}
                  className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-text"
                >
                  <Plus className="size-3.5" />
                  <PlatformBadge platform={platform} className="size-4 rounded-[0.3rem]" />
                </button>
              </form>
            ))}
        </div>
      )}

      {/* Deux semaines : 7 colonnes sur grand écran, défilement horizontal sur mobile. */}
      <div className="mt-6 grid auto-cols-[9rem] grid-flow-col gap-3 overflow-x-auto pb-2 lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible">
        {days.map((key) => {
          const { weekday, day } = dayLabel(key);
          const slots = byDay.get(key) ?? [];
          return (
            <div key={key} className="flex flex-col gap-2">
              <p className="flex items-baseline gap-1.5 px-0.5">
                <span className="text-xs font-semibold text-muted uppercase">{weekday}</span>
                <span className={`font-headline text-xl leading-none ${slots.length ? "text-text" : "text-faint"}`}>
                  {day}
                </span>
              </p>
              {slots.length === 0 && <div className="h-24 rounded-xl border border-line/60 bg-surface/40" />}
              {slots.map((entry) => {
                const post = entry.post;
                if (!post) {
                  return (
                    <button
                      key={entry.at}
                      type="button"
                      disabled={!enabled}
                      onClick={() => setPicking(entry.at)}
                      className="group flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-2/50 text-sm transition-[border-color,background-color,translate] duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <span className="text-xs font-semibold text-muted tabular-nums">{timeOf(entry.at)}</span>
                      <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-b from-accent-2 to-accent text-white transition-transform group-hover:scale-105">
                        <Plus className="size-4" />
                      </span>
                      <span className="font-medium">{P.addVideo}</span>
                    </button>
                  );
                }
                const video = post.generationId ? videos.find((v) => v.id === post.generationId) : undefined;
                return (
                  <div
                    key={entry.at + post.id}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
                  >
                    {video ? (
                      <video
                        src={`${video.mediaUrl}#t=0.1`}
                        preload="metadata"
                        muted
                        playsInline
                        webkit-playsinline=""
                        disablePictureInPicture
                        disableRemotePlayback
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <p className="absolute inset-0 line-clamp-6 p-3 pt-9 text-xs text-muted">{post.caption}</p>
                    )}
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
                    <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums">
                      {timeOf(entry.at)}
                    </span>
                    <span className="absolute top-2 right-2 flex gap-1">
                      {post.accountIds.map((id) => {
                        const account = accounts.find((a) => a.id === id);
                        return account ? <PlatformBadge key={id} platform={account.platform} className="size-5" /> : null;
                      })}
                    </span>
                    <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                      <span className={`rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold ${STATUS_STYLE[post.status]}`}>
                        {P.status[post.status]}
                      </span>
                      {post.links[0] && (
                        <a
                          href={post.links[0].url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={P.platforms[post.links[0].platform as SocialPlatform] ?? post.links[0].platform}
                          className="flex size-6 items-center justify-center rounded-md bg-black/70 text-white"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                      {post.status === "scheduled" && (
                        <form action={cancelPost}>
                          <input type="hidden" name="id" value={post.id} />
                          <ConfirmButton
                            confirm={P.cancelConfirm}
                            className="flex size-6 items-center justify-center rounded-md bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <X className="size-3.5" />
                            <span className="sr-only">{P.cancelPost}</span>
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {picking && (
        <PickerDialog title={`${longDate(picking)} · ${timeOf(picking)}`} onClose={() => setPicking(null)}>
          <SlotForm
            slot={picking}
            videos={videos}
            accounts={accounts}
            defaultAccountIds={plan.accountIds}
            onDone={() => setPicking(null)}
          />
        </PickerDialog>
      )}
    </section>
  );
}

function PickerDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  // Rendue sous <body> : l'animation d'entrée du calendrier (transform)
  // enfermerait sinon la fenêtre « fixed » dans le calendrier.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel max-h-[90dvh] w-full max-w-2xl animate-fade-up overflow-y-auto p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold first-letter:uppercase">{title}</h3>
          <button type="button" onClick={onClose} aria-label={t.planning.close} className="btn btn-ghost p-2">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
  videos: BoardVideo[];
  accounts: BoardAccount[];
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

  if (!usable.length) return <p className="mt-4 text-sm text-muted">{P.connectFirst}</p>;
  if (!videos.length) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{P.noVideos}</p>
        <Link href="/dashboard/generate" className="btn btn-hot">
          <Clapperboard />
          {P.createVideo}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-5">
      <input type="hidden" name="slot" value={slot} />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {videos.map((v, i) => (
          <label key={v.id} className="cursor-pointer">
            <input type="radio" name="generationId" value={v.id} defaultChecked={i === 0} className="peer sr-only" />
            <video
              src={`${v.mediaUrl}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              webkit-playsinline=""
              disablePictureInPicture
              disableRemotePlayback
              className="aspect-[9/16] w-full rounded-xl border-2 border-transparent bg-black object-cover transition-colors peer-checked:border-accent"
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
          <label
            key={a.id}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pr-3 pl-1 text-sm has-[:checked]:border-accent/60 has-[:checked]:bg-accent-soft"
          >
            <input type="checkbox" name="account" value={a.id} defaultChecked={checked(a.id)} className="sr-only" />
            <PlatformBadge platform={a.platform} className="size-6" />@{a.username}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-[var(--accent)]" />
        {P.consent}
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent w-full py-3 sm:w-auto">
        {pending ? P.scheduling : P.schedule}
      </button>
    </form>
  );
}

function RhythmEditor({
  plan,
  accounts,
  timezones,
}: {
  plan: BoardPlan;
  accounts: BoardAccount[];
  timezones: readonly string[];
}) {
  const { t } = useI18n();
  const P = t.planning;
  const pill =
    "flex cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-sm font-medium text-muted transition-colors has-[:checked]:border-accent/60 has-[:checked]:bg-accent-soft has-[:checked]:text-text";
  const timeInputs = Array.from({ length: MAX_PLAN_TIMES }, (_, i) => plan.times[i] ?? "");
  return (
    <form action={savePlan} className="panel mt-4 grid animate-fade-up gap-5 p-5 md:grid-cols-2">
      <fieldset>
        <legend className="label">{P.days}</legend>
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {WEEK.map((d) => (
            <label key={d} className={`${pill} px-0`}>
              <input type="checkbox" name="weekday" value={d} defaultChecked={plan.weekdays.includes(d)} className="sr-only" />
              {P.weekdays[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">{P.times}</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {timeInputs.map((time, i) => (
            <input key={i} type="time" name="time" defaultValue={time} className="field px-2 tabular-nums" />
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label">{P.timezone}</span>
        <select name="timezone" defaultValue={plan.timezone} className="field mt-1.5">
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">{P.alertDays}</span>
        <select name="alertDays" defaultValue={String(plan.alertDays)} className="field mt-1.5">
          {ALERT_DAY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {fmt(n === 1 ? P.alertDayOne : P.alertDayOption, { n })}
            </option>
          ))}
        </select>
      </label>
      {accounts.length > 0 && (
        <fieldset className="md:col-span-2">
          <legend className="label">{P.defaultAccounts}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {accounts.map((a) => (
              <label key={a.id} className={`${pill} gap-2`}>
                <input
                  type="checkbox"
                  name="account"
                  value={a.id}
                  defaultChecked={plan.accountIds.includes(a.id)}
                  className="sr-only"
                />
                <PlatformBadge platform={a.platform} className="size-5" />@{a.username}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 md:col-span-2">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
          <span className="relative inline-flex shrink-0">
            <input type="checkbox" name="alertEmail" defaultChecked={plan.alertEmail} className="peer sr-only" />
            <span className="h-6 w-11 rounded-full border border-line-strong bg-surface-3 transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
            <span className="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
          </span>
          {P.alertEmail}
        </label>
        <button type="submit" className="btn btn-accent">
          {P.save}
        </button>
      </div>
    </form>
  );
}
