import type { Block } from "@blocknote/core";
import { extractInlineText } from "@/../convex/lib/blockNoteDocument";
import { findSearchMatch } from "@/lib/searchMatch";
import type { SearchResult } from "@/components/windows/side-panel/SearchResultsList";

export type BlocknoteSearchHit = SearchResult & {
  /** Id du bloc, pour `scrollIntoView` via `[data-id]`. */
  blockId: string;
};

/** Plafond du nombre de résultats : borne le coût sur un gros doc. */
export const BLOCKNOTE_SEARCH_LIMIT = 200;

type SearchCandidate = {
  id?: string;
  type?: string;
  content?: unknown;
  children?: unknown;
};

/**
 * Blocs dont le texte contient `query`, dans l'ordre du document, en
 * descendant dans `children` (toggles, colonnes, listes imbriquées) comme
 * `extractHeadings`. Un hit par bloc, sur sa première occurrence.
 */
export function searchBlocknoteDoc(
  doc: Block[] | undefined,
  query: string,
): BlocknoteSearchHit[] {
  const hits: BlocknoteSearchHit[] = [];
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const raw of blocks) {
      if (hits.length >= BLOCKNOTE_SEARCH_LIMIT) return;
      const block = raw as SearchCandidate | null;
      if (!block || typeof block !== "object") continue;
      if (block.id) {
        const text = extractInlineText(block.content);
        const match = findSearchMatch(text, query);
        if (match) {
          hits.push({
            key: block.id,
            blockId: block.id,
            text,
            ...match,
            emphasis: block.type === "heading",
          });
        }
      }
      visit(block.children);
    }
  };
  visit(doc);
  return hits;
}
