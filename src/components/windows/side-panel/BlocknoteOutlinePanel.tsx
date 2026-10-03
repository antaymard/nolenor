import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Block } from "@blocknote/core";
import { cn } from "@/lib/utils";
import type { Heading } from "@/lib/blocknoteOutline";
import {
  searchBlocknoteDoc,
  type BlocknoteSearchHit,
} from "@/lib/blocknoteSearch";
import { useWindowSearchQuery } from "../WindowSearchContext";

/** Recalcul des résultats au plus une fois par pause de frappe dans le doc. */
const DOC_CHANGE_DEBOUNCE_MS = 300;
/** Contexte gardé de part et d'autre du match dans un extrait. */
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 80;

/**
 * Renders a blocknote heading outline, registered by `BlocknoteWindow` as the
 * window side panel's Plan tab content. With a search query, shows the blocks
 * whose text matches instead.
 */
export function BlocknoteOutlinePanel({
  headings,
  onSelect,
  getDoc,
  subscribeToDocChanges,
  onSelectBlock,
  className,
}: {
  headings: Heading[];
  onSelect: (heading: Heading) => void;
  /** Lu à la demande : le doc ne transite pas par les props à chaque frappe. */
  getDoc: () => Block[];
  subscribeToDocChanges: (callback: () => void) => () => void;
  onSelectBlock: (blockId: string) => void;
  className?: string;
}) {
  const query = useWindowSearchQuery().trim();

  if (query) {
    return (
      <BlocknoteSearchResults
        query={query}
        getDoc={getDoc}
        subscribeToDocChanges={subscribeToDocChanges}
        onSelectBlock={onSelectBlock}
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
        {headings.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            Add headings to generate the outline.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  type="button"
                  onClick={() => onSelect(heading)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    heading.depth === 1 && "font-semibold text-slate-700",
                    heading.depth === 2 && "pl-4",
                    heading.depth === 3 && "pl-6 text-slate-500",
                    heading.depth >= 4 && "pl-8 text-xs text-slate-500",
                  )}
                  title={heading.title}
                >
                  {heading.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BlocknoteSearchResults({
  query,
  getDoc,
  subscribeToDocChanges,
  onSelectBlock,
  className,
}: {
  query: string;
  getDoc: () => Block[];
  subscribeToDocChanges: (callback: () => void) => () => void;
  onSelectBlock: (blockId: string) => void;
  className?: string;
}) {
  // Monté seulement pendant une recherche : hors recherche, taper dans le doc
  // ne coûte rien de plus.
  const [docRevision, setDocRevision] = useState(0);
  useEffect(() => {
    let timeoutId: number | undefined;
    const unsubscribe = subscribeToDocChanges(() => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(
        () => setDocRevision((n) => n + 1),
        DOC_CHANGE_DEBOUNCE_MS,
      );
    });
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [subscribeToDocChanges]);

  // La saisie dans l'input reste fluide sur un gros doc : le parcours suit.
  const deferredQuery = useDeferredValue(query);
  const hits = useMemo(
    () => searchBlocknoteDoc(getDoc(), deferredQuery),
    // `docRevision` signale un doc modifié, que `getDoc` lit au moment du calcul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getDoc, deferredQuery, docRevision],
  );

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {hits.length === 0
          ? "No results"
          : `${hits.length} result${hits.length > 1 ? "s" : ""}`}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {hits.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            Nothing matches “{query}” in this document.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => onSelectBlock(hit.id)}
                  className={cn(
                    "block w-full rounded px-2 py-1 text-left text-sm leading-snug text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    hit.type === "heading" && "font-semibold text-slate-700",
                  )}
                >
                  <Snippet hit={hit} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Snippet({ hit }: { hit: BlocknoteSearchHit }) {
  const from = Math.max(0, hit.start - SNIPPET_BEFORE);
  const to = Math.min(hit.text.length, hit.end + SNIPPET_AFTER);
  return (
    <span className="line-clamp-3">
      {from > 0 && "…"}
      {hit.text.slice(from, hit.start)}
      <mark className="rounded-sm bg-yellow-200 text-slate-900">
        {hit.text.slice(hit.start, hit.end)}
      </mark>
      {hit.text.slice(hit.end, to)}
      {to < hit.text.length && "…"}
    </span>
  );
}
