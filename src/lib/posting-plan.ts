// Rythme de publication : jours (0 = dimanche), heures locales et fuseau.
// Les créneaux à venir sont calculés dans le fuseau du créateur, changements
// d'heure compris. Partagé client/serveur (aucune dépendance serveur).

export type PostingPlan = {
  weekdays: number[];
  times: string[];
  timezone: string;
  accountIds: string[];
  alertDays: number;
  alertEmail: boolean;
};

export const DEFAULT_PLAN: PostingPlan = {
  weekdays: [1, 3, 5],
  times: ["18:00"],
  timezone: "Europe/Paris",
  accountIds: [],
  alertDays: 3,
  alertEmail: true,
};

export const PLAN_TIMEZONES = [
  "Europe/Paris",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Brussels",
  "Europe/Zurich",
  "America/Montreal",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "Africa/Casablanca",
  "Africa/Abidjan",
  "Africa/Dakar",
  "Asia/Dubai",
] as const;

export const ALERT_DAY_OPTIONS = [1, 2, 3, 7] as const;
export const MAX_PLAN_TIMES = 3;
// Créneaux montrés dans le planning.
export const PLAN_HORIZON_DAYS = 14;

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

// Écart du fuseau avec UTC à cet instant, en ms.
function offsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

// Heure murale d'un fuseau → instant UTC. Deux passes : l'écart peut changer
// entre l'estimation et l'heure visée (passage à l'heure d'été).
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let ts = wall - offsetMs(new Date(wall), timeZone);
  ts = wall - offsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

// Créneaux du rythme entre maintenant et dans `days` jours, dans l'ordre.
export function upcomingSlots(plan: Pick<PostingPlan, "weekdays" | "times" | "timezone">, days: number, now = new Date()) {
  const end = now.getTime() + days * 86_400_000;
  const times = [...plan.times].filter(isTime).sort();
  const slots: Date[] = [];
  // Dates du calendrier local (et non tranches de 24 h, faussées par les
  // changements d'heure).
  const today = zonedParts(now, plan.timezone);
  for (let i = 0; i <= days; i++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    if (!plan.weekdays.includes(date.getUTCDay())) continue;
    for (const time of times) {
      const [hour, minute] = time.split(":").map(Number);
      const slot = zonedToUtc(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        hour,
        minute,
        plan.timezone,
      );
      if (slot.getTime() > now.getTime() && slot.getTime() <= end) slots.push(slot);
    }
  }
  return slots;
}

// Une publication programmée occupe le créneau à la minute près.
export function sameSlot(a: Date | string, b: Date | string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000;
}
