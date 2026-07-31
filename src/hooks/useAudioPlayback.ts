import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioStore } from "@/stores/audioStore";

export interface AudioLoop {
  start: number;
  end: number;
  enabled: boolean;
}

/** A loop only counts as set once it spans a real interval. */
export function isLoopSet(loop: AudioLoop | undefined): boolean {
  return !!loop && loop.end > loop.start;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

interface UseAudioPlaybackOptions {
  /** Canvas node id — the key used to claim the single playback slot. */
  nodeId: string;
  loop: AudioLoop;
  playbackRate: number;
  /** Called once when the file's duration becomes known. */
  onDurationDetected?: (duration: number) => void;
}

/**
 * Drives a single `<audio>` element for one canvas node.
 *
 * The playhead never goes through React: a requestAnimationFrame loop reads
 * `currentTime` and writes straight into the registered DOM nodes. Only
 * `isPlaying` is React state, so a playing node does not re-render its subtree
 * sixty times a second.
 *
 * The loop is enforced in that same rAF because `timeupdate` only fires at
 * roughly 4 Hz — far too coarse for a tight loop.
 */
export function useAudioPlayback({
  nodeId,
  loop,
  playbackRate,
  onDurationDetected,
}: UseAudioPlaybackOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLElement | null>(null);
  const playheadRef = useRef<HTMLElement | null>(null);
  const timeLabelRef = useRef<HTMLElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  // Read from inside the rAF, which would otherwise capture stale values.
  const loopRef = useRef(loop);
  const prevTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const requestPlay = useAudioStore((s) => s.requestPlay);
  const notifyStopped = useAudioStore((s) => s.notifyStopped);
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);
  // Boolean selector: starting one node only re-renders the two nodes involved.
  const ownsPlaybackSlot = useAudioStore((s) => s.playingNodeId === nodeId);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const syncUi = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const total = el.duration;
    const time = el.currentTime;
    const ratio =
      Number.isFinite(total) && total > 0
        ? Math.min(1, Math.max(0, time / total))
        : 0;
    const percent = `${ratio * 100}%`;
    if (progressRef.current) progressRef.current.style.width = percent;
    if (playheadRef.current) playheadRef.current.style.left = percent;
    if (timeLabelRef.current) timeLabelRef.current.textContent =
      formatTime(time);
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startRaf = useCallback(() => {
    stopRaf();
    const tick = () => {
      const el = audioRef.current;
      if (!el) return;
      const current = loopRef.current;
      const time = el.currentTime;
      // Jump only when the playhead *crosses* the end from inside the region.
      // A deliberate seek past the end therefore keeps playing instead of
      // yanking the listener back, and seeking before the region lets them
      // hear the run-up before the loop engages.
      if (
        current.enabled &&
        current.end > current.start &&
        time >= current.end &&
        prevTimeRef.current < current.end
      ) {
        el.currentTime = current.start;
      }
      prevTimeRef.current = el.currentTime;
      syncUi();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf, syncUi]);

  useEffect(() => stopRaf, [stopRaf]);

  const applyElementSettings = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    // Slowing a passage down to work on it must not transpose it.
    el.preservesPitch = true;
    el.volume = volume;
    el.muted = muted;
  }, [muted, playbackRate, volume]);

  // Covers later changes. The first application is done on loadedmetadata,
  // because the element only mounts once the node has a file and this effect
  // would otherwise have already run against a null ref.
  useEffect(() => {
    applyElementSettings();
  }, [applyElementSettings]);

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
    stopRaf();
    setIsPlaying(false);
  }, [stopRaf]);

  // Another node claimed the slot — stand down.
  useEffect(() => {
    if (!ownsPlaybackSlot && isPlaying) pause();
  }, [ownsPlaybackSlot, isPlaying, pause]);

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    const current = loopRef.current;
    // Starting outside an active loop would otherwise play an unrelated part
    // of the file until the region happens to come round.
    if (
      current.enabled &&
      current.end > current.start &&
      (el.currentTime < current.start || el.currentTime >= current.end)
    ) {
      el.currentTime = current.start;
    }
    prevTimeRef.current = el.currentTime;
    requestPlay(nodeId);
    try {
      await el.play();
      setIsPlaying(true);
      startRaf();
    } catch {
      // Autoplay rejection or an unsupported source: stay paused rather than
      // claiming a slot nothing is using.
      notifyStopped(nodeId);
      setIsPlaying(false);
    }
  }, [nodeId, notifyStopped, requestPlay, startRaf]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
      notifyStopped(nodeId);
    } else {
      void play();
    }
  }, [isPlaying, nodeId, notifyStopped, pause, play]);

  const seekToTime = useCallback(
    (time: number) => {
      const el = audioRef.current;
      if (!el) return;
      const total = Number.isFinite(el.duration) ? el.duration : 0;
      const next = Math.min(total, Math.max(0, time));
      el.currentTime = next;
      // Keep the crossing detector honest so a seek is never mistaken for the
      // playhead running past the loop end.
      prevTimeRef.current = next;
      syncUi();
    },
    [syncUi],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      const el = audioRef.current;
      if (!el || !Number.isFinite(el.duration)) return;
      seekToTime(el.duration * Math.min(1, Math.max(0, ratio)));
    },
    [seekToTime],
  );

  /** Back to the loop start when one is active, otherwise to the beginning. */
  const restart = useCallback(() => {
    const current = loopRef.current;
    seekToTime(
      current.enabled && current.end > current.start ? current.start : 0,
    );
  }, [seekToTime]);

  const handleLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    applyElementSettings();
    if (!Number.isFinite(el.duration)) return;
    setDuration(el.duration);
    onDurationDetected?.(el.duration);
    syncUi();
  }, [applyElementSettings, onDurationDetected, syncUi]);

  const handleEnded = useCallback(() => {
    pause();
    notifyStopped(nodeId);
  }, [nodeId, notifyStopped, pause]);

  const getCurrentTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  return {
    audioRef,
    progressRef,
    playheadRef,
    timeLabelRef,
    isPlaying,
    duration,
    toggle,
    pause,
    seekToRatio,
    seekToTime,
    restart,
    getCurrentTime,
    handleLoadedMetadata,
    handleEnded,
  };
}
