import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { FunctionReturnType } from "convex/server";
import { TbChevronRight, TbPlayerPlay } from "react-icons/tb";
import type { api } from "@/../convex/_generated/api";
import { formatTime } from "@/hooks/useMediaPlayback";
import { findActiveIndex, type PlaybackClock } from "@/lib/transcriptPlayback";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

type Transcript = NonNullable<
  FunctionReturnType<typeof api.ia.transcription.getTranscript>
>;

type Line = { s: number; e: number; text: string };

type Section = {
  startSec: number;
  endSec: number;
  title: string;
  summary?: string;
  /** Index range of this section's lines in the flat line list. */
  from: number;
  to: number;
};

/** After a manual scroll, stop following playback for this long. */
const FOLLOW_PAUSE_AFTER_USER_SCROLL_MS = 5_000;

/**
 * The video window's side panel: the overview, then one collapsible block per
 * chapter — timestamp, title and summary — that opens on the chapter's
 * transcript lines. A line plays from its timestamp; the line being spoken is
 * highlighted, and while playing, the current chapter opens by itself and the
 * panel follows it. Without chapters (not generated yet), a single block
 * holds the whole transcript.
 *
 * Playback comes from `clock`, not props: the window hosting the element
 * must not re-render on every `timeupdate`.
 */
export function MediaTranscriptPanel({
  transcript,
  clock,
  onSeek,
  emptyState,
  header,
}: {
  /** undefined while loading, null when there is no transcript. */
  transcript: Transcript | null | undefined;
  clock: PlaybackClock;
  onSeek: (seconds: number) => void;
  /** Shown instead when there is no transcript (call to action, progress). */
  emptyState: ReactNode;
  /** Above the transcript: re-transcribe action, running notice. */
  header?: ReactNode;
}) {
  if (transcript === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }
  if (transcript === null) return <>{emptyState}</>;
  return (
    <TranscriptSections
      // A new file or a new transcript starts from a clean open/closed state.
      key={transcript.sourceKey}
      transcript={transcript}
      clock={clock}
      onSeek={onSeek}
      header={header}
    />
  );
}

function TranscriptSections({
  transcript,
  clock,
  onSeek,
  header,
}: {
  transcript: Transcript;
  clock: PlaybackClock;
  onSeek: (seconds: number) => void;
  header?: ReactNode;
}) {
  const { lines, sections, sectionOfLine } = useMemo(() => {
    const lines: Line[] = transcript.chunks.flatMap((chunk) => chunk.segments);
    const chapters = transcript.chapters ?? [];
    const sections: Section[] =
      chapters.length > 0
        ? chapters.map((chapter) => ({
            startSec: chapter.startSec,
            endSec: chapter.endSec,
            title: chapter.title,
            summary: chapter.summary,
            from: 0,
            to: 0,
          }))
        : [
            {
              startSec: 0,
              endSec: lines[lines.length - 1]?.e ?? 0,
              title: "Transcript",
              from: 0,
              to: 0,
            },
          ];
    // Lines and chapters are both in time order: walk them together.
    const sectionOfLine: number[] = [];
    let current = 0;
    lines.forEach((line, index) => {
      while (
        current + 1 < sections.length &&
        sections[current + 1].startSec <= line.s
      ) {
        sections[current].to = index;
        current += 1;
        sections[current].from = index;
      }
      sectionOfLine.push(current);
    });
    sections[current].to = lines.length;
    return { lines, sections, sectionOfLine };
  }, [transcript]);

  // Derived snapshots: re-render only when the spoken line changes.
  const activeIndex = useSyncExternalStore(clock.subscribe, () =>
    findActiveIndex(lines, clock.getTime()),
  );
  const isPlaying = useSyncExternalStore(clock.subscribe, clock.isPlaying);
  const activeSection = activeIndex >= 0 ? sectionOfLine[activeIndex] : -1;

  const [openSections, setOpenSections] = useState<Set<number>>(
    () => new Set(sections.length === 1 ? [0] : []),
  );
  const toggle = useCallback((index: number) => {
    setOpenSections((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // While playing, the current chapter opens by itself.
  useEffect(() => {
    if (!isPlaying || activeSection < 0) return;
    setOpenSections((previous) =>
      previous.has(activeSection)
        ? previous
        : new Set(previous).add(activeSection),
    );
  }, [activeSection, isPlaying]);

  // …and the spoken line stays in view, unless the user is scrolling.
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const lastUserScrollAtRef = useRef(0);
  useEffect(() => {
    if (!isPlaying || activeIndex < 0) return;
    if (
      Date.now() - lastUserScrollAtRef.current <
      FOLLOW_PAUSE_AFTER_USER_SCROLL_MS
    ) {
      return;
    }
    rowRefs.current.get(activeIndex)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex, isPlaying, openSections]);
  const markUserScroll = useCallback(() => {
    lastUserScrollAtRef.current = Date.now();
  }, []);

  const [overviewOpen, setOverviewOpen] = useState(false);

  return (
    <div
      className="flex flex-col gap-1 p-2"
      onWheel={markUserScroll}
      onTouchMove={markUserScroll}
    >
      {header}
      {transcript.overview && (
        <>
          <SectionLabel
            hint="An overview of the whole recording, generated from its transcript."
            className="mb-1 mt-2"
          >
            Overview
          </SectionLabel>
          <button
            type="button"
            onClick={() => setOverviewOpen((open) => !open)}
            title={overviewOpen ? "Show less" : "Show more"}
            className={cn(
              "mb-2 whitespace-pre-wrap rounded-md px-2 py-1 text-left text-sm leading-relaxed text-slate-600 hover:bg-slate-50",
              !overviewOpen && "line-clamp-4",
            )}
          >
            {transcript.overview}
          </button>
        </>
      )}
      <SectionLabel
        hint={
          transcript.chapters?.length
            ? "The recording split by topic. Open a chapter to read it; click a line to play from there."
            : "Click a line to play from there. Chapters appear shortly after a transcription."
        }
        className="mb-1 mt-2"
      >
        {transcript.chapters?.length ? "Chapters" : "Transcript"}
      </SectionLabel>
      {sections.map((section, sectionIndex) => {
        const isOpen = openSections.has(sectionIndex);
        const isCurrent = sectionIndex === activeSection;
        return (
          <div
            key={`${section.startSec}:${sectionIndex}`}
            className={cn("rounded-md", isCurrent && "bg-amber-50/50")}
          >
            <div className="flex items-start">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(sectionIndex)}
                className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-1.5 py-1.5 text-left hover:bg-slate-50"
              >
                <TbChevronRight
                  size={14}
                  className={cn(
                    "mt-0.5 shrink-0 text-slate-400 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-xs tabular-nums text-slate-400">
                      {formatTime(section.startSec)}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {section.title}
                    </span>
                  </span>
                  {section.summary && (
                    <span
                      className={cn(
                        "text-xs leading-relaxed text-slate-500",
                        !isOpen && "line-clamp-2",
                      )}
                    >
                      {section.summary}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                title={`Play from ${formatTime(section.startSec)}`}
                onClick={() => onSeek(section.startSec)}
                className="mt-1 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <TbPlayerPlay size={14} />
              </button>
            </div>
            {isOpen && (
              <div className="flex flex-col pb-1.5 pl-5">
                {lines.slice(section.from, section.to).map((line, offset) => {
                  const index = section.from + offset;
                  return (
                    <div
                      key={index}
                      ref={(el) => {
                        if (el) rowRefs.current.set(index, el);
                        else rowRefs.current.delete(index);
                      }}
                      onClick={() => {
                        // Selecting text to copy it must not jump the player.
                        if (window.getSelection()?.toString()) return;
                        onSeek(line.s);
                      }}
                      className={cn(
                        "flex cursor-pointer gap-2 rounded-md px-1.5 py-0.5 hover:bg-slate-50",
                        index === activeIndex &&
                          "bg-amber-100/70 hover:bg-amber-100/70",
                      )}
                    >
                      <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[11px] tabular-nums text-slate-400">
                        {formatTime(line.s)}
                      </span>
                      <p className="min-w-0 flex-1 select-text text-sm leading-relaxed text-slate-700">
                        {line.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
