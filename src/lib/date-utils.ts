import {
  format as dateFnsFormat,
  formatDistanceToNow as dateFnsFormatDistanceToNow,
  formatDistanceToNowStrict as dateFnsFormatDistanceToNowStrict,
} from "date-fns";
import { enUS } from "date-fns/locale";

/**
 * Format a date with the English locale
 * @param date The date to format
 * @param formatStr The output format (e.g. "EEE dd MMM yyyy")
 */
export const format = (date: Date, formatStr: string) =>
  dateFnsFormat(date, formatStr, { locale: enUS });

/**
 * Format the distance between a date and now with the English locale
 * @param date The date to compare
 * @param options Additional options (e.g. { addSuffix: true })
 */
export const formatDistanceToNow = (
  date: Date,
  options?: Parameters<typeof dateFnsFormatDistanceToNow>[1]
) => dateFnsFormatDistanceToNow(date, { ...options, locale: enUS });

/**
 * Comme `formatDistanceToNow`, mais sans l'approximation d'usage : « 2 hours
 * ago » plutôt que « about 2 hours ago ».
 *
 * Pour les endroits où la place est comptée — une colonne de date au bout d'une
 * ligne de tâche —, et où l'« about » n'apprend rien : l'ordre de grandeur est
 * tout ce qu'on lit.
 */
export const formatDistanceToNowStrict = (
  date: Date,
  options?: Parameters<typeof dateFnsFormatDistanceToNowStrict>[1]
) => dateFnsFormatDistanceToNowStrict(date, { ...options, locale: enUS });
