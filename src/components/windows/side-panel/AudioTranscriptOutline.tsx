import { formatTime } from "@/hooks/useMediaPlayback";
import { PlanTabPlaceholder } from "./PlanTabPlaceholder";
import { SectionLabel } from "./SectionLabel";

export interface AudioTranscriptChapter {
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
}

/**
 * Plan tab of the audio window: the overview of the recording, then its
 * chapters, each jumping the window's player to where the chapter starts.
 * Chapters come from the step that follows a transcription, cut by topic.
 */
export function AudioTranscriptOutline({
  hasTranscript,
  chapters,
  overview,
  onSeek,
}: {
  /** undefined while loading. */
  hasTranscript: boolean | undefined;
  chapters?: AudioTranscriptChapter[];
  overview?: string;
  onSeek: (seconds: number) => void;
}) {
  if (hasTranscript === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  if (!hasTranscript) {
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
        hint="The recording split by topic. Click a chapter to play it."
        className="mb-3 mt-2"
      >
        Chapters
      </SectionLabel>
      {!chapters || chapters.length === 0 ? (
        <p className="px-2 text-sm text-slate-400">
          No chapters yet — they appear shortly after a transcription.
        </p>
      ) : (
        chapters.map((chapter) => (
          <button
            key={chapter.startSec}
            type="button"
            onClick={() => onSeek(chapter.startSec)}
            className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
          >
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {formatTime(chapter.startSec)}–{formatTime(chapter.endSec)}
            </span>
            <span className="text-sm font-medium text-slate-700">
              {chapter.title}
            </span>
            <span className="line-clamp-4 text-sm text-slate-600">
              {chapter.summary}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
