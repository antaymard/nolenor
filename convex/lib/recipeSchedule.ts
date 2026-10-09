import type { RecipeSchedule, RecipeTrigger } from "../schemas/recipesSchema";

/**
 * Le calendrier des routines : la prochaine occurrence d'un créneau, dans le
 * fuseau de l'utilisateur, sans librairie.
 *
 * Le principe : lire l'heure murale locale d'un instant (`Intl`), construire
 * l'heure murale voulue, puis la convertir en instant UTC en retranchant le
 * décalage du fuseau à cet instant. Au passage d'une heure d'été, une heure
 * murale qui n'existe pas (2 h 30 un dimanche de mars) glisse d'une heure ;
 * une heure qui existe deux fois prend la première. Pour des routines, c'est
 * suffisant.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const AT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = dimanche
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** Le fuseau est-il un identifiant IANA que le runtime connaît ? */
export function isValidTimezone(timezone: string): boolean {
  try {
    formatter(timezone);
    return true;
  } catch {
    return false;
  }
}

function wallClock(
  instant: number,
  timezone: string,
): WallClock & { second: number } {
  const parts: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = parts;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Décalage du fuseau à cet instant : heure murale lue comme UTC − instant. */
function offsetAt(instant: number, timezone: string): number {
  const w = wallClock(instant, timezone);
  const asUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    w.hour,
    w.minute,
    w.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** L'instant d'une heure murale. `day` peut déborder : Date.UTC normalise. */
function instantOf(
  wall: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
  timezone: string,
): number {
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );
  const guess = asUtc - offsetAt(asUtc, timezone);
  // Le décalage a pu changer entre `asUtc` et `guess` (heure d'été) : on
  // recale une fois sur celui de l'instant trouvé.
  return asUtc - offsetAt(guess, timezone);
}

function parseAt(at: string): { hour: number; minute: number } {
  const match = AT_PATTERN.exec(at);
  if (!match) throw new Error(`Invalid time "${at}"`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** La première occurrence du créneau strictement après `after`. */
export function nextOccurrence(
  schedule: RecipeSchedule,
  after: number,
): number {
  const now = wallClock(after, schedule.timezone);

  if (schedule.every === "hour") {
    // Prochaine minute 0 locale : on retire ce qui dépasse de l'heure murale.
    const intoHour =
      now.minute * MINUTE_MS + now.second * 1000 + (after % 1000);
    return after - intoHour + HOUR_MS;
  }

  const { hour, minute } = parseAt(schedule.at);
  const days = schedule.every === "week" ? new Set(schedule.days) : null;
  // Huit jours couvrent tout créneau hebdomadaire, même le jour même déjà passé.
  for (let offset = 0; offset <= 7; offset++) {
    const weekday = (now.weekday + offset) % 7;
    if (days && !days.has(weekday)) continue;
    const candidate = instantOf(
      { year: now.year, month: now.month, day: now.day + offset, hour, minute },
      schedule.timezone,
    );
    if (candidate > after) return candidate;
  }
  throw new Error("Schedule has no occurrence");
}

/** Le prochain lancement, tous créneaux confondus ; `undefined` sans créneau. */
export function nextRunAt(
  triggers: readonly RecipeTrigger[],
  after: number,
): number | undefined {
  let next: number | undefined;
  for (const trigger of triggers) {
    if (trigger.kind !== "schedule") continue;
    const at = nextOccurrence(trigger, after);
    if (next === undefined || at < next) next = at;
  }
  return next;
}

export function hasSchedule(triggers: readonly RecipeTrigger[]): boolean {
  return triggers.some((trigger) => trigger.kind === "schedule");
}

/**
 * Ce qui ne va pas dans un créneau, ou `null`. Le validateur Convex garantit
 * la forme ; ceci vérifie les valeurs.
 */
export function scheduleError(schedule: RecipeSchedule): string | null {
  if (!isValidTimezone(schedule.timezone)) {
    return `Unknown timezone "${schedule.timezone}".`;
  }
  if (schedule.every === "hour") return null;
  if (!AT_PATTERN.test(schedule.at)) {
    return `Invalid time "${schedule.at}", expected HH:MM.`;
  }
  if (schedule.every === "week") {
    const days = schedule.days;
    if (days.length === 0) return "A weekly schedule needs at least one day.";
    if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      return "Days must be integers from 0 (Sunday) to 6 (Saturday).";
    }
    if (new Set(days).size !== days.length) return "Days must not repeat.";
  }
  return null;
}
