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

export interface AudioTranscriptChapter {
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
}

/**
 * Plan tab of the audio window: the overview of the recording, then its
 * chapters, each jumping the window's player to where the chapter starts.
 * Chapters come from the step that follows a transcription, cut by topic;
 * until they land (or if it failed), the outline lists the ~2-minute search
 * passages with the beginning of their text instead.
 */
export function AudioTranscriptOutline({
  chunks,
  chapters,
  overview,
  onSeek,
}: {
  chunks: AudioTranscriptOutlineChunk[] | null | undefined;
  chapters?: AudioTranscriptChapter[];
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

  const entries: Array<{
    key: number;
    startSec: number;
    endSec: number;
    title?: string;
    text: string;
  }> =
    chapters && chapters.length > 0
      ? chapters.map((chapter) => ({
          key: chapter.startSec,
          startSec: chapter.startSec,
          endSec: chapter.endSec,
          title: chapter.title,
          text: chapter.summary,
        }))
      : chunks.map((chunk) => {
          const text = chunk.segments.map((segment) => segment.text).join(" ");
          return {
            key: chunk.order,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            text:
              text.length > PREVIEW_CHARS
                ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`
                : text,
          };
        });
  const hasChapters = Boolean(chapters && chapters.length > 0);

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
        hint={
          hasChapters
            ? "The recording split by topic. Click a chapter to play it."
            : "The transcript in passages of about two minutes. Click one to play it."
        }
        className="mb-3 mt-2"
      >
        {hasChapters ? "Chapters" : "Outline"}
      </SectionLabel>
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={() => onSeek(entry.startSec)}
          className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
        >
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {formatTime(entry.startSec)}–{formatTime(entry.endSec)}
          </span>
          {entry.title && (
            <span className="text-sm font-medium text-slate-700">
              {entry.title}
            </span>
          )}
          <span
            className={
              hasChapters
                ? "line-clamp-4 text-sm text-slate-600"
                : "line-clamp-3 text-sm text-slate-600"
            }
          >
            {entry.text}
          </span>
        </button>
      ))}
    </div>
  );
}
