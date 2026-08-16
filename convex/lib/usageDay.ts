/**
 * Bucket journalier de la comptabilité d'usage IA.
 *
 * UTC assumé, pas le fuseau de l'utilisateur : un rollup en « jour local » ne
 * serait correct que pour un fuseau et pour toujours — après un déplacement la
 * table mélangerait des lignes « jours Paris » et des lignes autre chose, sans
 * moyen de les distinguer. Et le handler tourne dans une action planifiée, qui
 * n'a aucun fuseau à sa disposition. La page l'écrit noir sur blanc plutôt que
 * de faire semblant.
 *
 * Le format ISO à largeur fixe est délibéré : l'ordre lexicographique y est
 * l'ordre chronologique (donc `gte`/`lte` sur l'index donnent une vraie plage
 * de dates), et la clé reste lisible telle quelle dans le data browser Convex
 * — ce qui compte le jour où un total paraît faux et qu'il faut comparer le
 * rollup à ses événements à l'œil.
 */

export const AI_USAGE_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

/** Clé de bucket journalier UTC pour un instant donné. */
export function utcDayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** `true` si la chaîne a bien la forme "YYYY-MM-DD" d'une clé de bucket. */
export function isValidDayKey(day: string): boolean {
  return AI_USAGE_DAY_PATTERN.test(day) && !Number.isNaN(dayKeyToMs(day));
}

/** Minuit UTC de la journée, en ms. `NaN` si la clé est malformée. */
export function dayKeyToMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/**
 * Nombre de journées couvertes par la plage, bornes incluses. Sert à refuser
 * une période absurde avant de lancer le scan d'index.
 */
export function daysInRange(fromDay: string, toDay: string): number {
  return (dayKeyToMs(toDay) - dayKeyToMs(fromDay)) / MS_PER_DAY + 1;
}
