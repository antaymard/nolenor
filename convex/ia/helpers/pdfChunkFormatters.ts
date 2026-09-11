import type { PdfPageChunk } from "../../models/searchableChunkModels";

export const MAX_PDF_PAGES_PER_CALL = 10;
export const MAX_PDF_CHARS_PER_CALL = 60_000;

const HEADING_LEVEL_TO_HASHES: Record<string, string> = {
  h1: "#",
  h2: "##",
  h3: "###",
  h4: "####",
  h5: "#####",
  h6: "######",
};

export type PdfTocResult = {
  markdown: string;
  totalPages: number;
  structured: boolean;
};

export function buildPdfTocMarkdown(pageChunks: PdfPageChunk[]): PdfTocResult {
  const totalPages =
    pageChunks.find((chunk) => typeof chunk.totalPages === "number")
      ?.totalPages ?? pageChunks.length;

  const lines: string[] = [];
  for (const chunk of pageChunks) {
    if (chunk.sections.length === 0) continue;
    const pageNumber = chunk.page;
    if (typeof pageNumber !== "number") continue;
    for (const section of chunk.sections) {
      const hashes = HEADING_LEVEL_TO_HASHES[section.level] ?? "#";
      lines.push(`${hashes} ${section.title} [${pageNumber}]`);
    }
  }

  return {
    markdown: lines.join("\n"),
    totalPages,
    structured: lines.length > 0,
  };
}

export type PdfPagesResult = {
  pages: Array<
    | { n: number; markdown: string; totalPages: number | undefined }
    | { n: number; error: "not_found" }
  >;
  truncated: boolean;
  totalPages: number | undefined;
};

export function buildPdfPagesMarkdown(
  pageChunks: PdfPageChunk[],
  requestedPages: number[],
): PdfPagesResult {
  const totalPages = pageChunks.find(
    (chunk) => typeof chunk.totalPages === "number",
  )?.totalPages;

  const byPage = new Map<number, PdfPageChunk>();
  for (const chunk of pageChunks) {
    if (typeof chunk.page === "number") byPage.set(chunk.page, chunk);
  }

  const dedupedSorted = Array.from(
    new Set(
      requestedPages.filter(
        (n) => Number.isInteger(n) && n > 0,
      ),
    ),
  ).sort((a, b) => a - b);

  const pages: PdfPagesResult["pages"] = [];
  let charCount = 0;
  let truncated = false;

  for (const n of dedupedSorted) {
    if (pages.length >= MAX_PDF_PAGES_PER_CALL) {
      truncated = true;
      break;
    }
    const chunk = byPage.get(n);
    if (!chunk) {
      pages.push({ n, error: "not_found" });
      continue;
    }
    if (charCount + chunk.text.length > MAX_PDF_CHARS_PER_CALL) {
      truncated = true;
      break;
    }
    pages.push({ n, markdown: chunk.text, totalPages });
    charCount += chunk.text.length;
  }

  return { pages, truncated, totalPages };
}
