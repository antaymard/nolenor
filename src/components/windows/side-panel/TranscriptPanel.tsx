import { TbFileText } from "react-icons/tb";
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
 */
export function TranscriptPanel({
  chunks,
  emptyMessage = "No transcript available yet.",
}: {
  chunks: TranscriptChunk[] | undefined;
  emptyMessage?: string;
}) {
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
        Transcript
      </SectionLabel>
      <div className="flex flex-col gap-3">
        {chunks.map((chunk) => (
          <div key={chunk.order} className="rounded-lg border p-3">
            {chunks.length > 1 && (
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {chunk.title || `Item ${chunk.order + 1}`}
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm text-slate-600 select-text">
              {chunk.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
