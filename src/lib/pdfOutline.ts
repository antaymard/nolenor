export type OutlineEntry = {
  pageIndex: number;
  level: number;
  title: string;
};

type PdfPageChunk = {
  order: number;
  page?: number;
  sections: Array<{ level: string; title: string }>;
};

const LEVEL_RE = /^h([1-6])$/;

/** Headings extracted from each page's markdown structure, in page order. */
export function buildOutlineFromPages(
  pages: readonly PdfPageChunk[] | undefined,
): OutlineEntry[] {
  if (!pages) return [];
  const entries: OutlineEntry[] = [];
  for (const page of pages) {
    const pageIndex = typeof page.page === "number" ? page.page - 1 : page.order;
    for (const section of page.sections) {
      const match = LEVEL_RE.exec(section.level);
      if (!match) continue;
      const title = section.title.trim();
      if (!title) continue;
      entries.push({
        pageIndex,
        level: parseInt(match[1], 10),
        title,
      });
    }
  }
  return entries;
}

/** One entry per page ("Page N"), used when no page has real markdown structure. */
export function buildFallbackOutline(numPages: number): OutlineEntry[] {
  if (numPages <= 0) return [];
  return Array.from({ length: numPages }, (_, i) => ({
    pageIndex: i,
    level: 1,
    title: `Page ${i + 1}`,
  }));
}
