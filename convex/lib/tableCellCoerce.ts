import {
  assertNeverColumnType,
  type TableColumnType,
} from "./tableColumnTypes";
import { coerceToIsoDate } from "./isoDate";
import {
  richTextFromPlainText,
  richTextToPlainText,
} from "./tableRichTextCell";

/**
 * Conversion d'une cellule quand la colonne change de type.
 *
 * Partagée par la grille (étiquette « Clears N cells » du menu de colonne) et
 * par le serveur, qui applique la conversion à l'état COURANT de la table (cf.
 * `tableOps.ts`) : une cellule écrite par quelqu'un d'autre pendant que le
 * menu était ouvert est convertie comme les autres.
 *
 * On ne cherche pas l'exhaustivité : on préserve les conversions qui ont un sens
 * évident (texte <-> rich text, texte <-> nombre, dates, liens, libellés de
 * select) et on rend `null` pour le reste, ce que le menu annonce avant de
 * l'appliquer.
 */

/** Ce que la conversion lit d'une colonne : son type, ses options de select. */
export type CoercibleColumn = {
  type: TableColumnType;
  options?: ReadonlyArray<{ id: string; label: string }>;
};

function selectLabels(value: unknown, column: CoercibleColumn): string {
  if (!Array.isArray(value)) return "";
  const byId = new Map((column.options ?? []).map((o) => [o.id, o.label]));
  return value
    .map((id) => (typeof id === "string" ? byId.get(id) : undefined))
    .filter((label): label is string => !!label)
    .join(", ");
}

/**
 * Représentation texte de la cellule SOURCE, pour la conversion.
 *
 * Une cellule `node` ne s'y traduit pas : elle ne stocke qu'un id, et écrire
 * un id brut dans une colonne texte serait pire que de vider — d'où le `null`.
 */
function sourceText(
  value: unknown,
  fromColumn: CoercibleColumn,
): string | null {
  if (value == null) return null;

  switch (fromColumn.type) {
    case "richtext":
      return richTextToPlainText(value);
    case "link":
      return (value as { href?: string }).href ?? "";
    case "checkbox":
      return value ? "true" : "false";
    case "select":
      return selectLabels(value, fromColumn);
    case "node":
      // Rien de lisible à en tirer sans les nodes du canvas.
      return null;
    case "text":
    case "number":
    case "date":
      return String(value);
    default:
      return assertNeverColumnType(fromColumn.type, "sourceText");
  }
}

export function coerceCellValue(
  value: unknown,
  fromColumn: CoercibleColumn,
  to: TableColumnType,
): unknown {
  if (value == null) return null;
  if (fromColumn.type === to) return value;

  const text = sourceText(value, fromColumn);
  if (text === null) return null;

  switch (to) {
    case "text":
      return text || null;

    case "richtext":
      return text ? richTextFromPlainText(text) : null;

    case "number": {
      if (typeof value === "number") return value;
      const parsed = Number(text.trim());
      return text.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
    }

    case "checkbox": {
      if (typeof value === "boolean") return value;
      // On ne coche que sur un booléen écrit en toutes lettres : toute chaîne
      // non vide donnait `true`, et convertir une colonne de noms en cases à
      // cocher les cochait toutes, en annonçant zéro perte.
      const normalized = text.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
      return null;
    }

    case "date":
      return coerceToIsoDate(text);

    case "link": {
      const href = text.trim();
      if (!href) return null;
      // Pas de fetch de métadonnées ici : la conversion doit rester synchrone.
      // L'utilisateur peut rouvrir la cellule pour récupérer le titre de page.
      return { href, pageTitle: "" };
    }

    case "select":
      // Les options de la colonne cible ne sont pas encore connues au moment du
      // changement de type.
      return null;

    case "node":
      // Un id de node ne se devine pas depuis du texte.
      return null;

    default:
      return assertNeverColumnType(to, "coerceCellValue");
  }
}

/**
 * Nombre de cellules qu'un changement de type ferait perdre. Sert à l'étiquette
 * « Clears N cells » du menu de colonne.
 *
 * Compte la perte de FIDÉLITÉ, pas seulement les `null` : convertir une colonne
 * node en cases à cocher écrivait `false` partout, donc un test sur la nullité
 * annonçait tranquillement zéro perte.
 */
export function countLossyCells(
  cells: ReadonlyArray<unknown>,
  fromColumn: CoercibleColumn,
  to: TableColumnType,
): number {
  let lost = 0;
  for (const value of cells) {
    if (value == null) continue;
    const converted = coerceCellValue(value, fromColumn, to);
    if (converted == null) {
      lost += 1;
      continue;
    }
    // Une conversion qui ne sait pas relire la source est une perte, même si
    // elle produit une valeur : c'est le cas de tout ce qui devient `false`.
    if (sourceText(value, fromColumn) === null) lost += 1;
  }
  return lost;
}
