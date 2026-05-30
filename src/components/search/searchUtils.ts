import type { SearchSnippet } from "./useSearch";

/** Tri des extraits d'un nœud : par page, puis ordre, puis position du match. */
export function sortSnippets(snippets: SearchSnippet[]): SearchSnippet[] {
  return [...snippets].sort((a, b) => {
    const pageA = a.page ?? Number.MAX_SAFE_INTEGER;
    const pageB = b.page ?? Number.MAX_SAFE_INTEGER;
    if (pageA !== pageB) return pageA - pageB;
    if (a.order !== b.order) return a.order - b.order;
    return a.matchStart - b.matchStart;
  });
}

/** Format relatif compact pour les dates (récents). */
export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} j`;
  return new Date(ts).toLocaleDateString();
}
