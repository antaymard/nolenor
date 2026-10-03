import { findSearchMatches } from "@/lib/searchMatch";
import type { SearchResult } from "@/components/windows/side-panel/SearchResultsList";

export type PdfSearchHit = SearchResult & { pageIndex: number };

type PdfPageText = { order: number; page?: number; text: string };

/** Plafonds : une page peut répéter un mot des dizaines de fois. */
export const PDF_SEARCH_LIMIT = 200;
const PDF_MATCHES_PER_PAGE = 10;

/**
 * Occurrences de `query` dans le texte indexé des pages (le markdown produit
 * à l'indexation, cf. `searchableChunks.listPdfPages`), page par page.
 */
export function searchPdfPages(
  pages: readonly PdfPageText[],
  query: string,
): PdfSearchHit[] {
  const hits: PdfSearchHit[] = [];
  for (const page of pages) {
    const pageIndex =
      typeof page.page === "number" ? page.page - 1 : page.order;
    const text = markdownToPlainText(page.text);
    const matches = findSearchMatches(
      text,
      query,
      Math.min(PDF_MATCHES_PER_PAGE, PDF_SEARCH_LIMIT - hits.length),
    );
    for (const match of matches) {
      hits.push({
        key: `${pageIndex}:${match.start}`,
        pageIndex,
        text,
        ...match,
        label: `p. ${pageIndex + 1}`,
      });
    }
    if (hits.length >= PDF_SEARCH_LIMIT) break;
  }
  return hits;
}

/**
 * Retire la syntaxe markdown la plus visible pour que les extraits se lisent
 * comme le PDF (et qu'un `**gras**` ne coupe pas un match).
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // liens → libellé
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // titres
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, " ") // séparateurs de table
    .replace(/\|/g, " ")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
