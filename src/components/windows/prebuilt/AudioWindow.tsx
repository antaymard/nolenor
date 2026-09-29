import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "convex/react";
import {
  TbAlertTriangle,
  TbMusic,
  TbRefresh,
  TbTextCaption,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useAudioTranscription } from "@/hooks/useAudioTranscription";
import { formatTime } from "@/hooks/useMediaPlayback";
import { useAudioStore } from "@/stores/audioStore";
import type { AudioValue } from "@/components/nodes/prebuilt-nodes/AudioNode";
import { displayNameOf } from "@/components/nodes/prebuilt-nodes/audio/audioDisplayName";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { AudioTranscriptOutline } from "@/components/windows/side-panel/AudioTranscriptOutline";
import WindowLoadingState from "@/components/windows/WindowLoadingState";
import { cn } from "@/lib/utils";

/**
 * Where playback was, across a fullscreen toggle — same reason and same
 * mechanism as `VideoWindow`: toggling remounts the window, and the new
 * `<audio>` element would start again from 0:00.
 */
const lastPositionByNode = new Map<Id<"nodeDatas">, number>();

/** After a manual scroll, stop following playback for this long. */
const FOLLOW_PAUSE_AFTER_USER_SCROLL_MS = 5_000;

type FlatSegment = { s: number; e: number; text: string; chunkIndex: number };

/** Index of the last segment starting at or before `time`, -1 if none. */
function findActiveIndex(segments: FlatSegment[], time: number): number {
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].s <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

interface AudioWindowProps {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
}

/**
 * Listening + reading surface: the player on top, the timestamped transcript
 * below. Clicking a line plays from there; the line being spoken is
 * highlighted and followed while playing. The Plan tab holds the outline.
 */
function AudioWindow({ xyNodeId, nodeDataId }: AudioWindowProps) {
  const values = useNodeDataValues(nodeDataId);
  const audio = (values?.audio as AudioValue | null | undefined) ?? null;

  const transcript = useQuery(
    api.ia.transcription.getTranscript,
    audio?.key ? { nodeDataId } : "skip",
  );
  // The full transcript is already read here: no need for the lighter check.
  const transcription = useAudioTranscription(nodeDataId, {
    withTranscriptCheck: false,
  });

  const segments = useMemo<FlatSegment[]>(
    () =>
      transcript
        ? transcript.chunks.flatMap((chunk, chunkIndex) =>
            chunk.segments.map((segment) => ({ ...segment, chunkIndex })),
          )
        : [],
    [transcript],
  );

  // ── Player (same slot / volume / restore contract as VideoWindow) ──────

  const elementRef = useRef<HTMLAudioElement | null>(null);
  const hasRestoredRef = useRef(false);

  const attachAudio = useCallback(
    (el: HTMLAudioElement | null) => {
      const previous = elementRef.current;
      if (!el && previous && previous.currentTime > 0) {
        lastPositionByNode.set(nodeDataId, previous.currentTime);
      }
      elementRef.current = el;
    },
    [nodeDataId],
  );

  const requestPlay = useAudioStore((s) => s.requestPlay);
  const notifyStopped = useAudioStore((s) => s.notifyStopped);
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);

  const slotKey = `${xyNodeId}:window`;
  const ownsPlaybackSlot = useAudioStore((s) => s.playingNodeId === slotKey);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = useCallback(() => {
    requestPlay(slotKey);
    setIsPlaying(true);
  }, [requestPlay, slotKey]);

  const handleStopped = useCallback(() => {
    notifyStopped(slotKey);
    setIsPlaying(false);
  }, [notifyStopped, slotKey]);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || ownsPlaybackSlot || el.paused) return;
    el.pause();
  }, [ownsPlaybackSlot]);

  const applySettings = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [muted, volume]);

  const handleLoadedMetadata = useCallback(() => {
    applySettings();

    const el = elementRef.current;
    if (!el || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = lastPositionByNode.get(nodeDataId);
    lastPositionByNode.delete(nodeDataId);
    if (saved === undefined) return;
    if (!Number.isFinite(el.duration) || saved >= el.duration) return;
    el.currentTime = saved;
  }, [applySettings, nodeDataId]);

  useEffect(() => {
    applySettings();
  }, [applySettings]);

  useEffect(() => () => notifyStopped(slotKey), [notifyStopped, slotKey]);

  const seek = useCallback((seconds: number) => {
    const el = elementRef.current;
    if (!el) return;
    el.currentTime = seconds;
    // `play` fires the element's own event, which claims the slot.
    void el.play().catch(() => {});
  }, []);

  // ── Following playback ─────────────────────────────────────────────────

  const [activeIndex, setActiveIndex] = useState(-1);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastUserScrollAtRef = useRef(0);

  const handleTimeUpdate = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    const next = findActiveIndex(segments, el.currentTime);
    // Only re-render when the spoken line changes, not on every tick.
    setActiveIndex((current) => (current === next ? current : next));
  }, [segments]);

  useEffect(() => {
    if (!isPlaying || activeIndex < 0) return;
    if (
      Date.now() - lastUserScrollAtRef.current <
      FOLLOW_PAUSE_AFTER_USER_SCROLL_MS
    ) {
      return;
    }
    rowRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex, isPlaying]);

  const markUserScroll = useCallback(() => {
    lastUserScrollAtRef.current = Date.now();
  }, []);

  // ── Plan tab: the outline ──────────────────────────────────────────────

  const { setPlanTabContent } = useWindowFrameContext();
  useEffect(() => {
    setPlanTabContent(
      <AudioTranscriptOutline
        // undefined = loading, null = no transcript for the current file.
        chunks={
          !audio
            ? null
            : transcript === undefined
              ? undefined
              : (transcript?.chunks ?? null)
        }
        overview={transcript?.overview}
        onSeek={seek}
      />,
    );
    return () => setPlanTabContent(null);
  }, [audio, seek, setPlanTabContent, transcript]);

  if (!values) return <WindowLoadingState />;

  if (!audio) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <TbMusic size={22} />
        <p className="text-sm">No audio</p>
      </div>
    );
  }

  const isRunning = transcription.state === "running";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="flex min-w-0 items-center gap-2">
          <TbMusic className="shrink-0 text-slate-400" size={16} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {displayNameOf(audio)}
          </span>
          {transcript && (
            <Button
              size="sm"
              variant="ghost"
              disabled={isRunning || transcription.tooLarge}
              title="Transcribe this file again — the current transcript will be replaced"
              onClick={() => void transcription.start()}
            >
              {isRunning ? <Spinner /> : <TbRefresh />}
              Re-transcribe
            </Button>
          )}
        </div>
        <audio
          ref={attachAudio}
          src={audio.url}
          controls
          preload="metadata"
          className="w-full"
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handleStopped}
          onEnded={handleStopped}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleTimeUpdate}
        />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
      >
        {transcript === undefined ? (
          <WindowLoadingState />
        ) : transcript === null ? (
          <TranscriptEmptyState transcription={transcription} />
        ) : (
          <div className="flex flex-col p-2">
            {isRunning && (
              <p className="mb-2 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                Transcribing again — this transcript will be replaced when it's
                done.
              </p>
            )}
            {segments.map((segment, index) => {
              const startsChunk =
                index === 0 ||
                segment.chunkIndex !== segments[index - 1].chunkIndex;
              const passage = startsChunk
                ? transcript.chunks[segment.chunkIndex]
                : undefined;
              const row = (
                <div
                  key={`${segment.chunkIndex}:${segment.s}:${index}`}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md px-2 py-1 hover:bg-slate-50",
                    startsChunk &&
                      index > 0 &&
                      !passage?.passageTitle &&
                      "mt-2 border-t pt-3",
                    index === activeIndex && "bg-amber-50 hover:bg-amber-50",
                  )}
                  onClick={() => {
                    // Selecting text to copy it must not jump the player.
                    if (window.getSelection()?.toString()) return;
                    seek(segment.s);
                  }}
                >
                  <button
                    type="button"
                    className="w-14 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-slate-400 hover:text-slate-700"
                    title={`Play from ${formatTime(segment.s)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      seek(segment.s);
                    }}
                  >
                    {formatTime(segment.s)}
                  </button>
                  <p className="min-w-0 flex-1 select-text text-sm leading-relaxed text-slate-700">
                    {segment.text}
                  </p>
                </div>
              );
              // A summarized passage opens with its title, like a chapter.
              if (!passage?.passageTitle) return row;
              return (
                <Fragment key={`${segment.chunkIndex}:${segment.s}:${index}`}>
                  <button
                    type="button"
                    className={cn(
                      "flex items-baseline gap-3 px-2 pb-1 text-left",
                      index > 0 ? "mt-3 border-t pt-3" : "mt-1",
                    )}
                    title={`Play from ${formatTime(passage.startSec)}`}
                    onClick={() => seek(passage.startSec)}
                  >
                    <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-slate-400">
                      {formatTime(passage.startSec)}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {passage.passageTitle}
                    </span>
                  </button>
                  {row}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** What the transcript area shows before there is a transcript. */
function TranscriptEmptyState({
  transcription,
}: {
  transcription: ReturnType<typeof useAudioTranscription>;
}) {
  const { state, error, start, progress, maxBytes } = transcription;

  if (state === "running") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Spinner className="size-5 text-muted-foreground" />
        <p className="text-sm text-slate-600">
          {progress
            ? `Transcribing… ${progress.done}/${progress.total} parts`
            : "Transcribing…"}
        </p>
        <p className="text-xs text-muted-foreground">
          You can close this window, the transcription keeps going.
        </p>
      </div>
    );
  }

  if (state === "tooLarge") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <TbTextCaption className="size-6 text-slate-300" />
        <p className="text-sm text-slate-500">
          This file is too large to be transcribed
          {maxBytes ? ` (max ${Math.round(maxBytes / (1024 * 1024))} MB)` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {state === "error" ? (
        <p className="flex max-w-sm items-start gap-1.5 text-left text-xs text-destructive">
          <TbAlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {error ?? "The transcription failed."}
          </span>
        </p>
      ) : (
        <>
          <TbTextCaption className="size-6 text-slate-300" />
          <p className="max-w-sm text-sm text-slate-500">
            Transcribe this audio to read it here, jump to any passage, and find
            what was said from search and from Nolë.
          </p>
        </>
      )}
      <Button size="sm" onClick={() => void start()}>
        <TbTextCaption />
        {state === "error" ? "Retry" : "Transcribe"}
      </Button>
    </div>
  );
}

export default memo(AudioWindow);
