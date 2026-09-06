// Dates stockées en ISO date nue ("YYYY-MM-DD") — cf. convex/config/fieldConfig.
//
// Le piège de ce format : `new Date("2024-03-05")` est spec'é UTC, alors que
// `getFullYear/getMonth/getDate` et `toLocaleDateString` sont locaux. À l'ouest
// de Greenwich, lire puis réécrire une date la reculait donc d'un jour. Le bug
// existait en quatre copies (champs custom, cellules de table, import CSV,
// conversion de type) ; il est corrigé ici, une fois.

/** `Date` -> "YYYY-MM-DD", sur les composantes LOCALES. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" -> `Date` à minuit LOCAL.
 *
 * Passer par le constructeur à composantes, et non par `new Date(iso)`, est ce
 * qui évite le décalage : une date nue ne porte pas de fuseau, elle désigne un
 * jour, pas un instant.
 */
export function parseIsoDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;

  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoDay) {
    const date = new Date(
      Number(isoDay[1]),
      Number(isoDay[2]) - 1,
      Number(isoDay[3]),
    );
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatAbsoluteDate(value: unknown): string | undefined {
  const date = parseIsoDate(value);
  if (!date) return undefined;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const MONTH_NAME =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const NUMERIC_DATE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/;

/**
 * Texte libre -> "YYYY-MM-DD", ou `null` si ça ne ressemble pas à une date.
 *
 * Utilisé par l'import CSV et par la conversion d'une colonne texte en date.
 *
 * Le point délicat est que `new Date()` accepte beaucoup trop : son analyseur
 * de repli lit `"Task number 8"` comme le 1er août 2001 et `"5"` comme le
 * 1er mai 2001. Convertir une colonne texte quelconque en date inventait donc
 * des dates, et l'étiquette « Clears N cells » les comptait comme des
 * conversions réussies. On exige maintenant une forme reconnaissable avant de
 * lui passer la main : soit des chiffres séparés, soit un nom de mois.
 *
 * Une date déjà ISO est découpée, pas reparsée, pour ne pas repasser par le
 * fuseau. Reste l'ambiguïté que JavaScript ne tranche pas et que nous ne
 * devinerons pas non plus : `"05/03/2024"` est lu à l'américaine (3 mai).
 */
export function coerceToIsoDate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const isoDay = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  if (isoDay) return isoDay[0];

  const looksLikeDate =
    NUMERIC_DATE.test(trimmed) ||
    (MONTH_NAME.test(trimmed) && /\d/.test(trimmed));
  if (!looksLikeDate) return null;

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : toIsoDate(parsed);
}
