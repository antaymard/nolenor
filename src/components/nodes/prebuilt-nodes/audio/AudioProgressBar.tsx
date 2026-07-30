import { memo, useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/hooks/useAudioPlayback";

interface AudioProgressBarProps {
  duration: number;
  // Primitives rather than the loop object: Convex syncs hand back a fresh
  // object on every update, which would defeat memo on every canvas sync.
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  /** Filled by the rAF loop — never written from React. */
  progressRef: MutableRefObject<HTMLElement | null>;
  playheadRef: MutableRefObject<HTMLElement | null>;
  onSeekRatio: (ratio: number) => void;
  className?: string;
}

/**
 * The navigation bar: click to seek, drag to scrub, hover for a preview
 * cursor showing where you would land.
 *
 * Scrubbing costs nothing here — the playhead is never persisted, so there is
 * no mutation and no store write behind the gesture, and `nodrag` already stops
 * React Flow from moving the node under the pointer.
 */
function AudioProgressBar({
  duration,
  loopStart,
  loopEnd,
  loopEnabled,
  progressRef,
  playheadRef,
  onSeekRatio,
  className,
}: AudioProgressBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const ghostLabelRef = useRef<HTMLDivElement | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  const ratioFromEvent = useCallback((clientX: number): number | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const moveGhost = useCallback(
    (ratio: number) => {
      const percent = `${ratio * 100}%`;
      if (ghostRef.current) ghostRef.current.style.left = percent;
      if (ghostLabelRef.current) {
        ghostLabelRef.current.style.left = percent;
        ghostLabelRef.current.textContent = formatTime(ratio * duration);
      }
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const ratio = ratioFromEvent(e.clientX);
      if (ratio === null) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      onSeekRatio(ratio);
    },
    [onSeekRatio, ratioFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ratio = ratioFromEvent(e.clientX);
      if (ratio === null) return;
      moveGhost(ratio);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        onSeekRatio(ratio);
      }
    },
    [moveGhost, onSeekRatio, ratioFromEvent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [],
  );

  const hasLoop = loopEnd > loopStart && duration > 0;
  const loopLeft = hasLoop ? (loopStart / duration) * 100 : 0;
  const loopWidth = hasLoop ? ((loopEnd - loopStart) / duration) * 100 : 0;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setIsHovering(true)}
      onPointerLeave={() => setIsHovering(false)}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ touchAction: "none" }}
      className={cn(
        "nodrag nopan relative h-2 w-full cursor-pointer rounded-full bg-black/10",
        className,
      )}
    >
      {hasLoop && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 rounded-full",
            loopEnabled ? "bg-violet-500/40" : "bg-violet-500/15",
          )}
          style={{ left: `${loopLeft}%`, width: `${loopWidth}%` }}
        />
      )}

      <div
        ref={(el) => {
          progressRef.current = el;
        }}
        className="pointer-events-none absolute inset-y-0 left-0 w-0 rounded-full bg-blue-500/70"
      />

      <div
        ref={(el) => {
          playheadRef.current = el;
        }}
        className="pointer-events-none absolute -top-0.5 -bottom-0.5 left-0 w-0.5 -translate-x-1/2 rounded-full bg-blue-700"
      />

      {/* Always mounted so the refs exist and the position is already correct
          when it fades in — mounting on hover would flash it at zero first. */}
      <div
        ref={ghostRef}
        className={cn(
          "pointer-events-none absolute -top-0.5 -bottom-0.5 left-0 w-px -translate-x-1/2 bg-black/40",
          isHovering && duration > 0 ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={ghostLabelRef}
        className={cn(
          "pointer-events-none absolute -top-5 left-0 -translate-x-1/2 rounded bg-black/75 px-1 text-[10px] leading-4 text-white tabular-nums",
          isHovering && duration > 0 ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

export default memo(AudioProgressBar);
