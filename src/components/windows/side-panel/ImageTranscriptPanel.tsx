import { TbPhoto } from "react-icons/tb";

export interface ImageTranscriptChunk {
  order: number;
  title?: string;
  text: string;
  imageUrl?: string;
}

/** Read-only transcript of each image on this node, generated at index time (`searchableChunks`). */
export function ImageTranscriptPanel({
  chunks,
}: {
  chunks: ImageTranscriptChunk[] | undefined;
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
        <TbPhoto className="size-6 text-slate-300" />
        <p className="text-sm text-slate-500">No transcript available yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {chunks.map((chunk) => (
        <div key={chunk.order} className="rounded-lg border p-3">
          {chunks.length > 1 && (
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {chunk.title || `Image ${chunk.order + 1}`}
            </div>
          )}
          <p className="whitespace-pre-wrap text-sm text-slate-600 select-text">
            {chunk.text}
          </p>
        </div>
      ))}
    </div>
  );
}
