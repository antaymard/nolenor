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

/**
 * Texte libre -> "YYYY-MM-DD", ou `null` si ça ne ressemble pas à une date.
 *
 * Utilisé par l'import CSV et par la conversion d'une colonne texte en date.
 * Deux garde-fous appris à nos dépens :
 *
 * - une chaîne uniquement numérique est refusée, sinon `new Date("5")` rendait
 *   `2001-05-01` et convertir une colonne de nombres inventait des dates ;
 * - une date déjà ISO est découpée, pas reparsée, pour ne pas repasser par le
 *   fuseau.
 *
 * Reste l'ambiguïté que JavaScript ne tranche pas : `"05/03/2024"` est lu à
 * l'américaine (3 mai). On ne devine pas la locale de l'utilisateur ici.
 */
export function coerceToIsoDate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return null;

  const isoDay = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  if (isoDay) return isoDay[0];

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : toIsoDate(parsed);
}
