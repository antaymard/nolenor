import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { OutlineEntry } from "@/lib/pdfOutline";
import { PDF_SEARCH_LIMIT, searchPdfPages } from "@/lib/pdfSearch";
import {
  useDebouncedSearchQuery,
  useWindowSearchQuery,
} from "../WindowSearchContext";
import { SearchResultsList } from "./SearchResultsList";

type PdfPageText = { order: number; page?: number; text: string };

/**
 * Renders a PDF page/section outline, registered by `PdfWindow` as the window
 * side panel's Plan tab content. With a search query, shows the matches in
 * the pages' indexed text instead.
 */
export function PdfOutlinePanel({
  entries,
  pages,
  onSelect,
  className,
}: {
  entries: OutlineEntry[];
  /** Texte indexé des pages ; undefined pendant le chargement. */
  pages: readonly PdfPageText[] | undefined;
  onSelect: (pageIndex: number) => void;
  className?: string;
}) {
  const query = useWindowSearchQuery().trim();
  if (query) {
    return (
      <PdfSearchResults
        query={query}
        pages={pages}
        onSelect={onSelect}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Outline
      </div>
      <div className="flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            No outline available.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((entry, index) => (
              <li key={`${entry.pageIndex}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.pageIndex)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    entry.level === 1 && "font-semibold text-slate-700",
                    entry.level === 2 && "pl-4",
                    entry.level === 3 && "pl-6 text-slate-500",
                    entry.level >= 4 && "pl-8 text-xs text-slate-500",
                  )}
                  title={entry.title}
                >
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PdfSearchResults({
  query,
  pages,
  onSelect,
  className,
}: {
  query: string;
  pages: readonly PdfPageText[] | undefined;
  onSelect: (pageIndex: number) => void;
  className?: string;
}) {
  const debouncedQuery = useDebouncedSearchQuery(query);
  const hits = useMemo(
    () => (pages ? searchPdfPages(pages, debouncedQuery) : []),
    [pages, debouncedQuery],
  );

  if (!pages || pages.length === 0) {
    return (
      <div className={cn("px-4 py-4 text-sm text-slate-400", className)}>
        {pages
          ? "This PDF's text isn't indexed yet, so it can't be searched."
          : "Loading…"}
      </div>
    );
  }

  return (
    <SearchResultsList
      results={hits}
      query={debouncedQuery}
      onSelect={(hit) => onSelect(hit.pageIndex)}
      truncated={hits.length >= PDF_SEARCH_LIMIT}
      className={className}
    />
  );
}
