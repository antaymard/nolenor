import { formatTime } from "@/hooks/useMediaPlayback";
import { PlanTabPlaceholder } from "./PlanTabPlaceholder";
import { SectionLabel } from "./SectionLabel";

const PREVIEW_CHARS = 120;

export interface AudioTranscriptOutlineChunk {
  order: number;
  startSec: number;
  endSec: number;
  passageTitle?: string;
  summary?: string;
  segments: Array<{ s: number; e: number; text: string }>;
}

/**
 * Plan tab of the audio window: the overview of the recording, then one entry
 * per ~2-minute passage (the search chunks), each jumping the window's player
 * to where the passage starts. Titles and summaries come from the summary
 * step that follows a transcription; until they land (or if it failed), a
 * passage shows the beginning of its text instead.
 */
export function AudioTranscriptOutline({
  chunks,
  overview,
  onSeek,
}: {
  chunks: AudioTranscriptOutlineChunk[] | null | undefined;
  overview?: string;
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
      {overview && (
        <>
          <SectionLabel
            hint="An overview of the whole recording, generated from its transcript."
            className="mb-2 mt-2"
          >
            Overview
          </SectionLabel>
          <p className="mb-3 whitespace-pre-wrap px-2 text-sm leading-relaxed text-slate-600 select-text">
            {overview}
          </p>
        </>
      )}
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
            {chunk.passageTitle && (
              <span className="text-sm font-medium text-slate-700">
                {chunk.passageTitle}
              </span>
            )}
            <span className="line-clamp-3 text-sm text-slate-600">
              {chunk.summary ?? preview}
            </span>
          </button>
        );
      })}
    </div>
  );
}
