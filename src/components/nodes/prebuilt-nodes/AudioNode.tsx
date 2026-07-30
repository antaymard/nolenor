import { memo, useCallback, useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
import {
  TbDownload,
  TbMusic,
  TbPencil,
  TbPlayerPause,
  TbPlayerPlay,
  TbPlayerTrackPrev,
} from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import AudioProgressBar from "./audio/AudioProgressBar";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { UploadFile } from "@/components/fields/UploadFile";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import {
  formatTime,
  useAudioPlayback,
  type AudioLoop,
} from "@/hooks/useAudioPlayback";
import type { Id } from "@/../convex/_generated/dataModel";

export type AudioValue = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
  duration: number;
  peaks: number[];
};

const DEFAULT_LOOP: AudioLoop = { start: 0, end: 0, enabled: false };

function AudioNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const variant = (xyNode.data?.variant as string | undefined) ?? "player";
  const isCompact = variant === "compact";

  // Field-level selectors: changing the loop must not invalidate the audio
  // object, and vice versa.
  const audio =
    useNodeDataValuesField<AudioValue | null>(nodeDataId, "audio") ?? null;
  const storedLoop = useNodeDataValuesField<AudioLoop>(nodeDataId, "loop");
  const playbackRate =
    useNodeDataValuesField<number>(nodeDataId, "playbackRate") ?? 1;

  const loop = storedLoop ?? DEFAULT_LOOP;

  const { updateNodeDataValues } = useUpdateNodeDataValues();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // The duration is not known at upload time (the file is never decoded), so
  // it is picked up from the element and written once.
  const handleDurationDetected = useCallback(
    (duration: number) => {
      if (!nodeDataId || !audio || audio.duration > 0) return;
      updateNodeDataValues({
        nodeDataId,
        values: { audio: { ...audio, duration } },
      });
    },
    [audio, nodeDataId, updateNodeDataValues],
  );

  const {
    audioRef,
    progressRef,
    playheadRef,
    timeLabelRef,
    isPlaying,
    duration: detectedDuration,
    toggle,
    seekToRatio,
    restart,
    handleLoadedMetadata,
    handleEnded,
  } = useAudioPlayback({
    nodeId: xyNode.id,
    loop,
    playbackRate,
    onDurationDetected: handleDurationDetected,
  });

  const duration = audio?.duration || detectedDuration;

  const handleUploadComplete = useCallback(
    (fileData: {
      url: string;
      filename: string;
      mimeType: string;
      size: number;
      uploadedAt: number;
      key: string;
    }) => {
      if (!nodeDataId) return;
      updateNodeDataValues({
        nodeDataId,
        values: {
          audio: { ...fileData, duration: 0, peaks: [] },
          // Loop bounds are timestamps into the old file — meaningless now.
          loop: DEFAULT_LOOP,
        },
      });
      setIsPopoverOpen(false);
    },
    [nodeDataId, updateNodeDataValues],
  );

  const handleRename = useCallback(() => {
    if (!nodeDataId || !audio) {
      setIsPopoverOpen(false);
      return;
    }
    const next = titleDraft.trim();
    if (next && next !== audio.filename) {
      // Display name only — the R2 key is untouched.
      updateNodeDataValues({
        nodeDataId,
        values: { audio: { ...audio, filename: next } },
      });
    }
    setIsPopoverOpen(false);
  }, [audio, nodeDataId, titleDraft, updateNodeDataValues]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) setTitleDraft(audio?.filename ?? "");
    },
    [audio?.filename],
  );

  const handleDownload = useCallback(async () => {
    if (!audio) return;
    try {
      const response = await fetch(audio.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = audio.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Download via fetch failed, falling back to anchor", err);
      const link = document.createElement("a");
      link.href = audio.url;
      link.download = audio.filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    }
  }, [audio]);

  const stopMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const bar = useMemo(
    () => (
      <AudioProgressBar
        duration={duration}
        loopStart={loop.start}
        loopEnd={loop.end}
        loopEnabled={loop.enabled}
        progressRef={progressRef}
        playheadRef={playheadRef}
        onSeekRatio={seekToRatio}
      />
    ),
    [
      duration,
      loop.start,
      loop.end,
      loop.enabled,
      playheadRef,
      progressRef,
      seekToRatio,
    ],
  );

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        {audio && (
          <Button
            variant="outline"
            size="icon"
            title="Télécharger"
            onClick={handleDownload}
          >
            <TbDownload />
          </Button>
        )}
        <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              title={audio ? "Renommer ou remplacer" : "Ajouter un fichier"}
            >
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <UploadFile
                accept="audio/*"
                onUploadComplete={handleUploadComplete}
              />
              {audio && (
                <>
                  <Input
                    onDoubleClick={stopMouseDown}
                    type="text"
                    placeholder="Nom du fichier"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                    }}
                  />
                  <Button size="sm" onClick={handleRename}>
                    Enregistrer
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </CanvasNodeToolbar>

      <NodeFrame xyNode={xyNode} resizable={!isCompact}>
        {audio ? (
          <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 px-2">
            <audio
              ref={audioRef}
              src={audio.url}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
            />

            {isCompact ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="nodrag shrink-0 text-blue-700"
                  onMouseDown={stopMouseDown}
                  onClick={toggle}
                  title={isPlaying ? "Pause" : "Lecture"}
                >
                  {isPlaying ? (
                    <TbPlayerPause size={16} />
                  ) : (
                    <TbPlayerPlay size={16} />
                  )}
                </button>
                <p className="min-w-0 flex-1 truncate text-sm">
                  {audio.filename}
                </p>
                <div className="w-16 shrink-0">{bar}</div>
              </div>
            ) : (
              <>
                <p className="truncate text-sm font-medium">{audio.filename}</p>
                {bar}
                <div className="nodrag flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onMouseDown={stopMouseDown}
                    onClick={restart}
                    title="Revenir au début"
                  >
                    <TbPlayerTrackPrev size={15} />
                  </button>
                  <button
                    type="button"
                    className="text-blue-700 hover:text-blue-900"
                    onMouseDown={stopMouseDown}
                    onClick={toggle}
                    title={isPlaying ? "Pause" : "Lecture"}
                  >
                    {isPlaying ? (
                      <TbPlayerPause size={18} />
                    ) : (
                      <TbPlayerPlay size={18} />
                    )}
                  </button>
                  <span className="tabular-nums text-muted-foreground">
                    <span ref={timeLabelRef}>0:00</span>
                    {" / "}
                    {formatTime(duration)}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center gap-2 px-2">
            <TbMusic size={18} className="shrink-0" />
            <p className="text-sm text-muted-foreground">Aucun audio</p>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(AudioNode, areNodePropsEqual);
