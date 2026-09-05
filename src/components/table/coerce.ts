import { richTextFromPlainText, richTextToPlainText } from "./richText";
import type {
  CellValue,
  ColumnType,
  LinkCellValue,
  SelectCellValue,
  TableColumn,
} from "./types";

/**
 * Conversion d'une cellule quand la colonne change de type.
 *
 * Avant, changer le type d'une colonne remettait TOUTES ses cellules à `null`.
 * C'était déjà brutal ; avec l'arrivée du type `richtext` ça rendait le nouveau
 * type inutilisable, puisque passer une colonne texte remplie en rich text
 * aurait effacé son contenu.
 *
 * On ne cherche pas l'exhaustivité : on préserve les conversions qui ont un sens
 * évident (texte <-> rich text, texte <-> nombre, dates, liens, labels de
 * select) et on retombe sur `null` pour le reste — le comportement historique.
 */

/** Représentation texte d'une cellule, quel que soit son type d'origine. */
function toPlainText(value: CellValue, from: ColumnType): string {
  if (value == null) return "";

  switch (from) {
    case "richtext":
      return richTextToPlainText(value);
    case "link":
      return (value as LinkCellValue).href ?? "";
    case "checkbox":
      return value ? "true" : "false";
    case "node":
      // La cellule ne stocke qu'un id : sans le store des nodes on ne peut pas
      // en tirer un libellé lisible. Mieux vaut vider que d'écrire un id brut.
      return "";
    case "select":
      return "";
    default:
      return String(value);
  }
}

/** Labels d'une cellule select, qui ont besoin des options de la colonne source. */
function selectLabels(value: CellValue, from: TableColumn): string {
  if (from.type !== "select" || !Array.isArray(value)) return "";
  const byId = new Map((from.options ?? []).map((o) => [o.id, o.label]));
  return (value as SelectCellValue)
    .map((id) => byId.get(id))
    .filter((label): label is string => !!label)
    .join(", ");
}

function toIsoDay(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function coerceCellValue(
  value: CellValue,
  from: TableColumn,
  to: ColumnType,
): CellValue {
  if (value == null) return null;
  if (from.type === to) return value;

  const text =
    from.type === "select" ? selectLabels(value, from) : toPlainText(value, from.type);

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
      const normalized = text.trim().toLowerCase();
      if (normalized === "false" || normalized === "0" || normalized === "") {
        return false;
      }
      return true;
    }

    case "date":
      return toIsoDay(text);

    case "link": {
      const href = text.trim();
      if (!href) return null;
      // Pas de fetch de métadonnées ici : la conversion doit rester synchrone.
      // L'utilisateur peut rouvrir la cellule pour récupérer le titre de page.
      return { href, pageTitle: "" } satisfies LinkCellValue;
    }

    default:
      // `select` (les options de la colonne cible ne sont pas encore connues au
      // moment du changement de type) et `node` (un id ne se devine pas).
      return null;
  }
}

/** Nombre de cellules qu'un changement de type ferait perdre. Sert au menu. */
export function countLossyCells(
  cells: CellValue[],
  from: TableColumn,
  to: ColumnType,
): number {
  let lost = 0;
  for (const value of cells) {
    if (value == null) continue;
    if (coerceCellValue(value, from, to) == null) lost += 1;
  }
  return lost;
}
