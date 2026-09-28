import { formatTime } from "@/hooks/useMediaPlayback";
import { PlanTabPlaceholder } from "./PlanTabPlaceholder";
import { SectionLabel } from "./SectionLabel";

const PREVIEW_CHARS = 120;

export interface AudioTranscriptOutlineChunk {
  order: number;
  startSec: number;
  endSec: number;
  segments: Array<{ s: number; e: number; text: string }>;
}

/**
 * Plan tab of the audio window: one line per ~2-minute passage (the search
 * chunks), each jumping the window's player to where the passage starts.
 * The full transcript is the window body; this is the table of contents.
 */
export function AudioTranscriptOutline({
  chunks,
  onSeek,
}: {
  chunks: AudioTranscriptOutlineChunk[] | null | undefined;
  onSeek: (seconds: number) => void;
}) {
  if (chunks === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  if (chunks === null || chunks.length === 0) {
    return (
      <PlanTabPlaceholder message="No transcript yet. Transcribe this audio to get an outline." />
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <SectionLabel
        hint="The transcript in passages of about two minutes. Click one to play it."
        className="mb-3 mt-2"
      >
        Outline
      </SectionLabel>
      {chunks.map((chunk) => {
        const text = chunk.segments.map((segment) => segment.text).join(" ");
        const preview =
          text.length > PREVIEW_CHARS
            ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`
            : text;
        return (
          <button
            key={chunk.order}
            type="button"
            onClick={() => onSeek(chunk.startSec)}
            className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
          >
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {formatTime(chunk.startSec)}–{formatTime(chunk.endSec)}
            </span>
            <span className="line-clamp-2 text-sm text-slate-600">
              {preview}
            </span>
          </button>
        );
      })}
    </div>
  );
}
