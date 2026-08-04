// Étape 1 du pont Markdown : réduire un document PlateJS au sous-ensemble de
// types que le sérialiseur Markdown sait rendre, AVANT de le lui donner.
//
// Pourquoi une passe préalable plutôt que des règles `MarkdownPlugin` :
//   - c'est du TS pur (aucun import Plate, aucun runtime Node), donc
//     déterministe, lisible et testable sans éditeur ;
//   - ça évite d'avoir à deviner ce que fait le sérialiseur sur un type qu'il
//     ne connaît pas — après cette passe, il ne voit plus que `p` (avec ses
//     propriétés `listStyleType` / `indent` / `checked`), `h1`–`h6`,
//     `blockquote`, `hr`, `code_block`/`code_line`, `table`/`tr`/`td`/`th`,
//     `img` et `a` ;
//   - le mark `pill` sérialisé par les règles MDX du chemin agent ressortirait
//     **littéralement** (`<pill color="blue">x</pill>`) une fois reparsé par
//     BlockNote. Ici il est simplement retiré.
//
// Tout ce qui n'a pas d'équivalent BlockNote est soit dégradé (on garde le
// texte / l'URL), soit supprimé — et compté, pour que la migration puisse
// rapporter ce qu'elle a réellement perdu, document par document.

import { normalizeDatePillValue } from "../lib/datePill";
import { formatDateToken } from "../ia/helpers/blockNoteMarkdown";

export type PlateNode = Record<string, unknown>;

export type SimplifyStats = {
  /** Type -> nombre de nœuds convertis en une forme approchante. */
  degraded: Record<string, number>;
  /** Type -> nombre de nœuds purement supprimés. */
  dropped: Record<string, number>;
};

/**
 * Marks conservés parce que Markdown sait les exprimer. Tout le reste
 * (`pill`, `kbd`, `highlight`, `color`, `backgroundColor`, `fontSize`,
 * `fontFamily`, `subscript`, `superscript`, `comment*`, `suggestion`…) est
 * retiré : une liste blanche est le seul moyen sûr de ne rien laisser passer
 * qui produirait du MDX ou un mark inconnu.
 */
const KEPT_LEAF_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
]);

/** Blocs sans aucune contrepartie : ils disparaissent entièrement. */
const DROPPED_BLOCK_TYPES = new Set([
  "toc", // BlockNote construit son sommaire à part (FullscreenBlocknoteWindow)
  "placeholder", // upload en cours, jamais du contenu
  "excalidraw",
]);

/** Éléments inline transitoires : jamais du contenu persistant. */
const DROPPED_INLINE_TYPES = new Set(["mention_input", "slash_input"]);

/** Conteneurs dont on garde les enfants mais pas la structure. */
const UNWRAPPED_TYPES = new Set(["column_group", "column"]);

/**
 * Médias non-image : dégradés en lien pour au moins préserver l'URL.
 *
 * Le libellé compte : `[https://x/y.mp4](https://x/y.mp4)` est re-sérialisé en
 * URL nue par remark, que BlockNote reparse en simple texte — le lien est
 * perdu. Un libellé distinct de l'URL force un vrai nœud `link`, donc une URL
 * cliquable et conservée dans `href`.
 */
const MEDIA_LINK_TYPES = new Map([
  ["video", "Video"],
  ["audio", "Audio"],
  ["file", "File"],
  ["media_embed", "Embed"],
]);

function isPlainObject(value: unknown): value is PlateNode {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTextLeaf(node: PlateNode): boolean {
  return typeof node.text === "string";
}

function count(bucket: Record<string, number>, type: string): void {
  bucket[type] = (bucket[type] ?? 0) + 1;
}

/** Texte visible d'un sous-arbre Plate, sans mise en forme. */
function plainText(node: unknown): string {
  if (!isPlainObject(node)) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.children)) return "";
  return node.children.map(plainText).join("");
}

function textLeaf(text: string): PlateNode {
  return { text };
}

/** Un élément dont tous les enfants ont disparu doit garder une feuille vide. */
function withChildren(element: PlateNode, children: PlateNode[]): PlateNode {
  return {
    ...element,
    children: children.length > 0 ? children : [textLeaf("")],
  };
}

/**
 * `{ type: "date", date: "2026-01-04" }` → `[[date:2026-01-04]]`.
 *
 * C'est le seul type custom qui traverse le pont Markdown **sans perte** :
 * `markdownToBlockNoteBlocks` appelle `expandDateTokensInBlocks`, qui
 * retransforme ce token exact en vrai pill `{ type: "date", props: { date } }`.
 * Une valeur illisible n'a pas de forme ISO et ne peut donc pas redevenir un
 * pill : on retombe sur le texte brut plutôt que d'émettre un token malformé.
 */
function dateToText(element: PlateNode): PlateNode {
  const raw = typeof element.date === "string" ? element.date : "";
  const iso = normalizeDatePillValue(raw);
  return textLeaf(iso ? formatDateToken(iso) : raw);
}

/** Médias non-image → un paragraphe contenant un lien vers l'URL d'origine. */
function mediaToLinkParagraph(
  element: PlateNode,
  fallbackLabel: string,
): PlateNode | null {
  const url = typeof element.url === "string" ? element.url : "";
  if (!url) return null;
  const label =
    (typeof element.name === "string" && element.name) ||
    plainText({ children: element.caption }) ||
    fallbackLabel;
  return {
    type: "p",
    children: [{ type: "a", url, children: [textLeaf(label)] }],
  };
}

function simplifyLeaf(leaf: PlateNode, stats: SimplifyStats): PlateNode {
  const out: PlateNode = { text: leaf.text };
  for (const key of Object.keys(leaf)) {
    if (key === "text") continue;
    if (KEPT_LEAF_MARKS.has(key)) {
      out[key] = leaf[key];
      continue;
    }
    // `id` et `key` ne sont pas des marks : les ignorer sans les compter comme
    // une perte de mise en forme.
    if (key !== "id" && key !== "key") count(stats.degraded, `mark:${key}`);
  }
  return out;
}

/** Renvoie les nœuds de remplacement : `[]` = supprimé, plusieurs = déplié. */
function simplifyNode(node: unknown, stats: SimplifyStats): PlateNode[] {
  if (!isPlainObject(node)) return [];
  if (isTextLeaf(node)) return [simplifyLeaf(node, stats)];

  const type = typeof node.type === "string" ? node.type : "";
  const children = Array.isArray(node.children) ? node.children : [];
  const simplifiedChildren = children.flatMap((child) =>
    simplifyNode(child, stats),
  );

  if (DROPPED_BLOCK_TYPES.has(type) || DROPPED_INLINE_TYPES.has(type)) {
    count(stats.dropped, type);
    return [];
  }

  if (UNWRAPPED_TYPES.has(type)) {
    count(stats.degraded, type);
    return simplifiedChildren;
  }

  switch (type) {
    case "date":
      // Compté comme dégradé seulement si la valeur ne peut pas redevenir un
      // pill ; sinon la conversion est exacte.
      if (!normalizeDatePillValue(typeof node.date === "string" ? node.date : ""))
        count(stats.degraded, "date");
      return [dateToText(node)];

    case "mention":
      // Décision produit : la référence inline vers un autre node dégrade en
      // texte brut (BlockNote n'a pas d'équivalent).
      count(stats.degraded, "mention");
      return [textLeaf(typeof node.value === "string" ? node.value : "")];

    case "callout":
      count(stats.degraded, "callout");
      return [withChildren({ type: "blockquote" }, simplifiedChildren)];

    case "toggle":
      // Le contenu replié vit dans les blocs suivants (propriété `indent`),
      // pas dans les enfants du toggle : seul son libellé est ici.
      count(stats.degraded, "toggle");
      return [withChildren({ type: "p" }, simplifiedChildren)];

    case "equation":
      count(stats.degraded, "equation");
      return [
        withChildren({ type: "p" }, [
          textLeaf(typeof node.texExpression === "string" ? node.texExpression : ""),
        ]),
      ];

    case "inline_equation":
      count(stats.degraded, "inline_equation");
      return [
        textLeaf(typeof node.texExpression === "string" ? node.texExpression : ""),
      ];

    default:
      break;
  }

  // Élément sans `type` : impossible à écrire aujourd'hui
  // (`validatePlateDocument` l'interdit), mais présent dans des lignes
  // antérieures à ce garde-fou. Le sérialiseur Markdown l'ignore purement et
  // simplement — donc sans cette normalisation en paragraphe, un document qui
  // en contient perd son texte et finit en quarantaine.
  if (type === "") {
    if (simplifiedChildren.length === 0) return [];
    count(stats.degraded, "(sans type)");
    return [withChildren({ type: "p" }, simplifiedChildren)];
  }

  const mediaLabel = MEDIA_LINK_TYPES.get(type);
  if (mediaLabel) {
    const paragraph = mediaToLinkParagraph(node, mediaLabel);
    if (!paragraph) {
      count(stats.dropped, type);
      return [];
    }
    count(stats.degraded, type);
    return [paragraph];
  }

  return [withChildren(node, simplifiedChildren)];
}

/**
 * Réduit un document Plate au sous-ensemble sérialisable en Markdown.
 * Les blocs de premier niveau devenus vides sont supprimés — un `toc` seul ne
 * doit pas laisser un paragraphe fantôme derrière lui.
 */
export function simplifyPlateForMarkdown(nodes: readonly unknown[]): {
  nodes: PlateNode[];
  stats: SimplifyStats;
} {
  const stats: SimplifyStats = { degraded: {}, dropped: {} };
  const out = nodes.flatMap((node) => simplifyNode(node, stats));
  return { nodes: out, stats };
}

/** True dès qu'un document Plate contient du texte ou un média visible. */
export function plateDocumentHasSubstance(nodes: readonly unknown[]): boolean {
  for (const node of nodes) {
    if (!isPlainObject(node)) continue;
    if (typeof node.text === "string" && node.text.trim() !== "") return true;
    const type = typeof node.type === "string" ? node.type : "";
    if (
      type === "img" ||
      type === "hr" ||
      type === "table" ||
      type === "date" ||
      MEDIA_LINK_TYPES.has(type)
    ) {
      return true;
    }
    if (Array.isArray(node.children) && plateDocumentHasSubstance(node.children)) {
      return true;
    }
  }
  return false;
}
