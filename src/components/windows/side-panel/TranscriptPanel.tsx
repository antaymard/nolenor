import { Fragment, useDeferredValue, useMemo } from "react";
import { TbFileText } from "react-icons/tb";
import { findSearchMatches, type SearchMatch } from "@/lib/searchMatch";
import { useWindowSearchQuery } from "../WindowSearchContext";
import { SectionLabel } from "./SectionLabel";

export interface TranscriptChunk {
  order: number;
  title?: string;
  text: string;
  imageUrl?: string;
}

/**
 * Read-only transcript generated at index time (`searchableChunks`) — used by
 * any node type whose content gets summarized into searchable text (image,
 * link so far). Labeled explicitly as "Transcript" so it reads as generated
 * content, not the node's own text.
 *
 * With a search query, only the chunks that match stay, their matches
 * highlighted in place: the text is short and already all here, so there is
 * nowhere else for a result to lead.
 */
export function TranscriptPanel({
  chunks,
  emptyMessage = "No transcript available yet.",
}: {
  chunks: TranscriptChunk[] | undefined;
  emptyMessage?: string;
}) {
  const query = useDeferredValue(useWindowSearchQuery().trim());
  const visibleChunks = useMemo(
    () =>
      (chunks ?? []).flatMap((chunk) => {
        const matches = query ? findSearchMatches(chunk.text, query) : [];
        return !query || matches.length > 0 ? [{ chunk, matches }] : [];
      }),
    [chunks, query],
  );
  const matchCount = visibleChunks.reduce(
    (total, { matches }) => total + matches.length,
    0,
  );

  if (chunks === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <TbFileText className="size-6 text-slate-300" />
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <SectionLabel
        hint="Text generated from this node's content, used to power search."
        className="mb-3 mt-2"
      >
        {query
          ? `Transcript · ${matchCount} match${matchCount === 1 ? "" : "es"}`
          : "Transcript"}
      </SectionLabel>
      {query && visibleChunks.length === 0 && (
        <p className="px-2 text-sm text-slate-400">
          Nothing matches “{query}”.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {visibleChunks.map(({ chunk, matches }) => (
          <div key={chunk.order} className="rounded-lg border p-3">
            {chunks.length > 1 && (
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {chunk.title || `Item ${chunk.order + 1}`}
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm text-slate-600 select-text">
              <HighlightedText text={chunk.text} matches={matches} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: SearchMatch[];
}) {
  if (matches.length === 0) return <>{text}</>;
  let cursor = 0;
  return (
    <>
      {matches.map((match) => {
        const before = text.slice(cursor, match.start);
        cursor = match.end;
        return (
          <Fragment key={match.start}>
            {before}
            <mark className="rounded-sm bg-yellow-200 text-yellow-950 dark:bg-yellow-400/30 dark:text-yellow-100">
              {text.slice(match.start, match.end)}
            </mark>
          </Fragment>
        );
      })}
      {text.slice(cursor)}
    </>
  );
}
