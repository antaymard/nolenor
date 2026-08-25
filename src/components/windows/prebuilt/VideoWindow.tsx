import { memo, useCallback, useEffect, useRef } from "react";
import { TbVideo } from "react-icons/tb";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useAudioStore } from "@/stores/audioStore";
import type { Id } from "@/../convex/_generated/dataModel";
import type { VideoValue } from "@/components/nodes/prebuilt-nodes/VideoNode";

interface VideoWindowProps {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
}

/**
 * Watching surface: the picture as large as the window allows, with the
 * browser's own controls.
 *
 * Native `controls` here rather than the node's custom strip — off the canvas
 * there is no drag to fight, and they bring native fullscreen, picture-in-
 * picture and subtitle tracks for free.
 */
function VideoWindow({ xyNodeId, nodeDataId }: VideoWindowProps) {
  const values = useNodeDataValues(nodeDataId);
  const video = (values?.video as VideoValue | null | undefined) ?? null;

  const elementRef = useRef<HTMLVideoElement | null>(null);

  const requestPlay = useAudioStore((s) => s.requestPlay);
  const notifyStopped = useAudioStore((s) => s.notifyStopped);
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);

  // A key of its own, distinct from the node's: the window and the node on the
  // canvas are then two contenders for the same single slot, so opening this
  // window pauses the node without any arbitration code of its own.
  const slotKey = `${xyNodeId}:window`;
  const ownsPlaybackSlot = useAudioStore((s) => s.playingNodeId === slotKey);

  // With native controls the user plays through the browser's own button, not
  // through our code — so the slot has to be claimed from the element's
  // events. Miss this and the window plays straight over an audio node.
  const handlePlay = useCallback(() => {
    requestPlay(slotKey);
  }, [requestPlay, slotKey]);

  const handleStopped = useCallback(() => {
    notifyStopped(slotKey);
  }, [notifyStopped, slotKey]);

  // Something else claimed the slot — stand down.
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

  // This effect only covers later changes: on the first render `values` is
  // still undefined, so the element does not exist yet and the effect would
  // have nothing to write to — and it never re-runs on its own once the
  // element appears. `loadedmetadata` is what applies the settings the first
  // time, which is the same split useMediaPlayback makes.
  useEffect(() => {
    applySettings();
  }, [applySettings]);

  // Leaving the window playing would keep a slot nobody can see or stop.
  useEffect(() => () => notifyStopped(slotKey), [notifyStopped, slotKey]);

  if (!values) return null;

  if (!video) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <TbVideo size={22} />
        <p className="text-sm">No video</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <video
        ref={elementRef}
        src={video.url}
        poster={video.poster?.url}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
        onLoadedMetadata={applySettings}
        onPlay={handlePlay}
        onPause={handleStopped}
        onEnded={handleStopped}
      />
    </div>
  );
}

export default memo(VideoWindow);
