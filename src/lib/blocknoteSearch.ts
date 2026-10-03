import type { Block } from "@blocknote/core";
import { extractInlineText } from "@/../convex/lib/blockNoteDocument";
import { findSearchMatch } from "@/lib/searchMatch";

export type BlocknoteSearchHit = {
  /** Id du bloc, pour `scrollIntoView` via `[data-id]`. */
  id: string;
  type: string;
  text: string;
  /** Bornes du premier match dans `text`. */
  start: number;
  end: number;
};

type SearchCandidate = {
  id?: string;
  type?: string;
  content?: unknown;
  children?: unknown;
};

/**
 * Blocs dont le texte contient `query`, dans l'ordre du document, en
 * descendant dans `children` (toggles, colonnes, listes imbriquées) comme
 * `extractHeadings`. Un hit par bloc ; `limit` borne le coût sur un gros doc.
 */
export function searchBlocknoteDoc(
  doc: Block[] | undefined,
  query: string,
  limit = 200,
): BlocknoteSearchHit[] {
  const hits: BlocknoteSearchHit[] = [];
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const raw of blocks) {
      if (hits.length >= limit) return;
      const block = raw as SearchCandidate | null;
      if (!block || typeof block !== "object") continue;
      if (block.id) {
        const text = extractInlineText(block.content);
        const match = findSearchMatch(text, query);
        if (match) {
          hits.push({ id: block.id, type: block.type ?? "", text, ...match });
        }
      }
      visit(block.children);
    }
  };
  visit(doc);
  return hits;
}
