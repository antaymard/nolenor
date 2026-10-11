import type { Doc } from "@/../convex/_generated/dataModel";

export type RecipeTrigger = Doc<"recipes">["triggers"][number];
export type ScheduleTrigger = Extract<RecipeTrigger, { kind: "schedule" }>;
export type OnceTrigger = Extract<RecipeTrigger, { kind: "once" }>;

export const WEEKDAYS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 0, short: "Sun" },
] as const;

/** Le fuseau du navigateur : celui des créneaux qu'on crée ici. */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function newSchedule(): ScheduleTrigger {
  return {
    kind: "schedule",
    every: "day",
    at: "09:00",
    timezone: browserTimezone(),
  };
}

/** Demain à 9 h, heure locale : un point de départ raisonnable. */
export function newOnce(now = Date.now()): OnceTrigger {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return { kind: "once", at: date.getTime() };
}

/** Change la fréquence en gardant ce qui peut l'être (heure, fuseau). */
export function withEvery(
  schedule: ScheduleTrigger,
  every: ScheduleTrigger["every"],
): ScheduleTrigger {
  const at = schedule.every === "hour" ? "09:00" : schedule.at;
  const { timezone } = schedule;
  if (every === "hour") return { kind: "schedule", every, timezone };
  if (every === "day") return { kind: "schedule", every, at, timezone };
  const days = schedule.every === "week" ? schedule.days : [1];
  return { kind: "schedule", every, at, days, timezone };
}

/** `datetime-local` lit et écrit l'heure locale, sans fuseau. */
export function toDateTimeLocal(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function fromDateTimeLocal(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function describeDays(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "every day";
  const weekdays = [1, 2, 3, 4, 5];
  if (set.size === 5 && weekdays.every((d) => set.has(d))) return "weekdays";
  return WEEKDAYS.filter((d) => set.has(d.value))
    .map((d) => d.short)
    .join(", ");
}

/** Le libellé court d'un déclencheur, pour la liste des recipes. */
export function describeTrigger(trigger: RecipeTrigger): string {
  switch (trigger.kind) {
    case "manual":
      return "Run by canvas members";
    case "once":
      return `Once, ${formatDateTime(trigger.at)}`;
    case "schedule": {
      const tz =
        trigger.timezone === browserTimezone() ? "" : ` (${trigger.timezone})`;
      if (trigger.every === "hour") return `Every hour${tz}`;
      if (trigger.every === "day") return `Every day at ${trigger.at}${tz}`;
      const days = describeDays(trigger.days);
      return `${days[0].toUpperCase()}${days.slice(1)} at ${trigger.at}${tz}`;
    }
  }
}

/** Ce que la liste affiche à la place des déclencheurs planifiés. */
export function describeSchedule(recipe: Doc<"recipes">): string {
  const scheduled = recipe.triggers.filter((t) => t.kind !== "manual");
  if (scheduled.length === 0) return "Manual";
  const first = describeTrigger(scheduled[0]);
  return scheduled.length === 1 ? first : `${first} +${scheduled.length - 1}`;
}
