import { format } from "@/lib/date-utils";

/**
 * Helpers autour des clés de bucket "YYYY-MM-DD" utilisées par la comptabilité
 * d'usage IA. Les journées sont comptées en UTC côté serveur (cf.
 * convex/lib/usageDay.ts) : ces helpers restent donc en UTC pour tout ce qui
 * touche aux clés, et ne repassent en local que pour l'affichage.
 */

const MS_PER_DAY = 86_400_000;

/** Clé de bucket de la journée UTC en cours. */
export function todayUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Décale une clé de bucket de `days` journées (négatif pour remonter). */
export function shiftUtcDay(day: string, days: number): string {
  const shifted = new Date(Date.parse(`${day}T00:00:00.000Z`) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** Toutes les clés de la plage, bornes incluses, dans l'ordre chronologique. */
export function enumerateDays(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  const end = Date.parse(`${toDay}T00:00:00.000Z`);
  for (
    let at = Date.parse(`${fromDay}T00:00:00.000Z`);
    at <= end;
    at += MS_PER_DAY
  ) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Convertit une clé en `Date` locale à la même date calendaire.
 *
 * Surtout PAS `new Date("2026-08-09")` : cette forme est parsée comme minuit
 * UTC, et la formater avec un formateur local décale l'étiquette d'un jour pour
 * tout lecteur à l'ouest de Greenwich. On reconstruit donc la date composant
 * par composant, pour que l'étiquette corresponde toujours à la clé.
 */
export function parseDayLocal(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** Étiquette courte d'axe, ex. "9 Aug". */
export function formatDayShort(day: string): string {
  return format(parseDayLocal(day), "d MMM");
}

/** Étiquette longue de tooltip, ex. "Sat 9 Aug 2026". */
export function formatDayLong(day: string): string {
  return format(parseDayLocal(day), "EEE d MMM yyyy");
}

/**
 * Plage lisible, ex. "13 Jul – 11 Aug 2026". L'année n'est répétée sur la borne
 * de gauche que si la plage la franchit : sans ça, « 12 Aug – 11 Aug » sur une
 * période de 12 mois se lit comme une erreur.
 */
export function formatDayRange(fromDay: string, toDay: string): string {
  const sameYear = fromDay.slice(0, 4) === toDay.slice(0, 4);
  const from = format(parseDayLocal(fromDay), sameYear ? "d MMM" : "d MMM yyyy");
  return `${from} – ${format(parseDayLocal(toDay), "d MMM yyyy")}`;
}
