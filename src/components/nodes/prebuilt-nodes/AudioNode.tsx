import { memo, useCallback, useMemo, useState } from "react";
import {
  TbDownload,
  TbFlag,
  TbGauge,
  TbMusic,
  TbPencil,
  TbPlayerPause,
  TbPlayerPlay,
  TbPlayerTrackPrev,
  TbRepeat,
  TbRepeatOff,
  TbVolume,
  TbVolumeOff,
  TbX,
} from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import MediaProgressBar from "./media/MediaProgressBar";
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
import { useFileUpload } from "@/hooks/useFilesUpload";
import { useDownloadFile } from "@/hooks/useDownloadFile";
import { extractAudioMetadata } from "@/lib/audioMetadata";
import {
  formatTime,
  isLoopSet,
  useMediaPlayback,
  type MediaLoop,
} from "@/hooks/useMediaPlayback";
import { useAudioStore } from "@/stores/audioStore";
import type { XyNodeProps } from "@/types/domain";

export type AudioValue = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
  duration: number;
  peaks: number[];
  title?: string;
  artist?: string;
  label?: string;
  cover?: { url: string; key: string } | null;
};

/**
 * Mirrors getNodeDataTitle's precedence: what the user typed, then the file's
 * own tags, then the filename.
 */
function displayNameOf(audio: AudioValue | null): string {
  if (!audio) return "";
  if (audio.label?.trim()) return audio.label.trim();
  if (audio.title?.trim()) {
    const title = audio.title.trim();
    const artist = audio.artist?.trim();
    return artist ? `${artist} — ${title}` : title;
  }
  return audio.filename;
}

const DEFAULT_LOOP: MediaLoop = { start: 0, end: 0, enabled: false };

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function AudioNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const variant = (xyNode.data?.variant as string | undefined) ?? "player";
  const isCompact = variant === "compact";

  // Field-level selectors: changing the loop must not invalidate the audio
  // object, and vice versa.
  const audio =
    useNodeDataValuesField<AudioValue | null>(nodeDataId, "audio") ?? null;
  const storedLoop = useNodeDataValuesField<MediaLoop>(nodeDataId, "loop");
  const playbackRate =
    useNodeDataValuesField<number>(nodeDataId, "playbackRate") ?? 1;

  const loop = storedLoop ?? DEFAULT_LOOP;

  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { uploadFile } = useFileUpload();
  const { downloadStoredFile } = useDownloadFile();

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
    mediaRef: audioRef,
    progressRef,
    playheadRef,
    timeLabelRef,
    isPlaying,
    duration: detectedDuration,
    toggle,
    seekToRatio,
    restart,
    getCurrentTime,
    handleLoadedMetadata,
    handleEnded,
  } = useMediaPlayback({
    nodeId: xyNode.id,
    loop,
    playbackRate,
    onDurationDetected: handleDurationDetected,
  });

  const duration = audio?.duration || detectedDuration;

  const writeLoop = useCallback(
    (next: MediaLoop) => {
      if (!nodeDataId) return;
      // The stored object is recreated on every sync, so compare the fields:
      // Object.is on the whole object would call every write a change.
      if (
        next.start === loop.start &&
        next.end === loop.end &&
        next.enabled === loop.enabled
      ) {
        return;
      }
      updateNodeDataValues({ nodeDataId, values: { loop: next } });
    },
    [loop.enabled, loop.end, loop.start, nodeDataId, updateNodeDataValues],
  );

  // Planting a flag must always leave a usable region rather than an inverted
  // one, so the opposite bound gives way when it would end up on the wrong side.
  const handleFlagStart = useCallback(() => {
    const start = getCurrentTime();
    const end = loop.end > start ? loop.end : duration;
    writeLoop({ start, end, enabled: loop.enabled });
  }, [duration, getCurrentTime, loop.enabled, loop.end, writeLoop]);

  const handleFlagEnd = useCallback(() => {
    const end = getCurrentTime();
    const start = loop.start < end ? loop.start : 0;
    writeLoop({ start, end, enabled: loop.enabled });
  }, [getCurrentTime, loop.enabled, loop.start, writeLoop]);

  const handleToggleLoop = useCallback(() => {
    if (!isLoopSet(loop)) return;
    writeLoop({ ...loop, enabled: !loop.enabled });
  }, [loop, writeLoop]);

  const handleClearLoop = useCallback(() => {
    writeLoop(DEFAULT_LOOP);
  }, [writeLoop]);

  const handleRateChange = useCallback(
    (rate: number) => {
      if (!nodeDataId || rate === playbackRate) return;
      updateNodeDataValues({ nodeDataId, values: { playbackRate: rate } });
    },
    [nodeDataId, playbackRate, updateNodeDataValues],
  );

  const handleUploadComplete = useCallback(
    async (
      fileData: {
        url: string;
        filename: string;
        mimeType: string;
        size: number;
        uploadedAt: number;
        key: string;
      },
      file: File,
    ) => {
      if (!nodeDataId) return;
      setIsPopoverOpen(false);

      const tags = await extractAudioMetadata(file);

      let cover: { url: string; key: string } | null = null;
      if (tags.cover) {
        try {
          const extension = tags.cover.mimeType.split("/")[1] ?? "jpg";
          const uploaded = await uploadFile(
            new File([tags.cover.blob], `cover.${extension}`, {
              type: tags.cover.mimeType,
            }),
          );
          cover = { url: uploaded.url, key: uploaded.key };
        } catch (error) {
          console.warn("[AudioNode] cover upload failed", error);
        }
      }

      // One write for the whole gesture: splitting it would create two
      // versions and run the R2 reference sync twice.
      updateNodeDataValues({
        nodeDataId,
        values: {
          audio: {
            ...fileData,
            duration: 0,
            peaks: [],
            title: tags.title,
            artist: tags.artist,
            cover,
          },
          // Loop bounds are timestamps into the old file — meaningless now.
          loop: DEFAULT_LOOP,
        },
      });
    },
    [nodeDataId, updateNodeDataValues, uploadFile],
  );

  const handleRename = useCallback(() => {
    if (!nodeDataId || !audio) {
      setIsPopoverOpen(false);
      return;
    }
    const next = titleDraft.trim();
    // Writes `label`, never `filename`: renaming the node must not change the
    // name the file is downloaded under.
    if (next && next !== displayNameOf(audio)) {
      updateNodeDataValues({
        nodeDataId,
        values: { audio: { ...audio, label: next } },
      });
    }
    setIsPopoverOpen(false);
  }, [audio, nodeDataId, titleDraft, updateNodeDataValues]);

  const displayName = displayNameOf(audio);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) setTitleDraft(displayName);
    },
    [displayName],
  );

  const handleDownload = useCallback(() => {
    if (!audio) return;
    // `filename`, jamais `label` : le nom affiché sur le node ne doit pas
    // renommer le fichier sur le disque.
    void downloadStoredFile({
      key: audio.key,
      url: audio.url,
      filename: audio.filename,
    });
  }, [audio, downloadStoredFile]);

  const stopMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);
  const setVolume = useAudioStore((s) => s.setVolume);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);

  const loopIsSet = isLoopSet(loop);

  const bar = useMemo(
    () => (
      <MediaProgressBar
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
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" title="Vitesse et volume">
                  <TbGauge />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      Vitesse
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {PLAYBACK_RATES.map((rate) => (
                        <Button
                          key={rate}
                          size="sm"
                          variant={
                            rate === playbackRate ? "default" : "outline"
                          }
                          onClick={() => handleRateChange(rate)}
                        >
                          {rate}x
                        </Button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      La hauteur est conservée.
                    </p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      Volume
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleMuted}
                        title={muted ? "Réactiver le son" : "Couper le son"}
                      >
                        {muted ? (
                          <TbVolumeOff size={16} />
                        ) : (
                          <TbVolume size={16} />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {loopIsSet && (
              <Button
                variant="outline"
                size="icon"
                title="Effacer la boucle"
                onClick={handleClearLoop}
              >
                <TbX />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              title="Télécharger"
              onClick={handleDownload}
            >
              <TbDownload />
            </Button>
          </>
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
          <div className="flex h-full w-full min-w-0 items-center gap-2 px-2">
            <audio
              ref={audioRef}
              src={audio.url}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
            />

            {/* No cover, no thumbnail: an empty square would be worse than the
                plain layout. `draggable` off so the browser's native image
                drag does not fight the node drag. */}
            {!isCompact && audio.cover && (
              <img
                src={audio.cover.url}
                alt=""
                draggable={false}
                className="pointer-events-none size-14 shrink-0 rounded object-cover"
              />
            )}

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
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
                {audio.cover && (
                  <img
                    src={audio.cover.url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none size-5 shrink-0 rounded-[3px] object-cover"
                  />
                )}
                <p className="min-w-0 flex-1 truncate text-sm">{displayName}</p>
                <div className="w-16 shrink-0">{bar}</div>
              </div>
            ) : (
              <>
                <p className="truncate text-sm font-medium">{displayName}</p>
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

                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="flex items-center gap-0.5 text-muted-foreground hover:text-violet-700"
                      onMouseDown={stopMouseDown}
                      onClick={handleFlagStart}
                      title="Début de la boucle ici"
                    >
                      <TbFlag size={14} />
                      {loopIsSet && (
                        <span className="text-[10px] tabular-nums">
                          {formatTime(loop.start)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-0.5 text-muted-foreground hover:text-violet-700"
                      onMouseDown={stopMouseDown}
                      onClick={handleFlagEnd}
                      title="Fin de la boucle ici"
                    >
                      <TbFlag size={14} className="-scale-x-100" />
                      {loopIsSet && (
                        <span className="text-[10px] tabular-nums">
                          {formatTime(loop.end)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={
                        loop.enabled
                          ? "text-violet-700"
                          : "text-muted-foreground hover:text-foreground disabled:opacity-40"
                      }
                      onMouseDown={stopMouseDown}
                      onClick={handleToggleLoop}
                      disabled={!loopIsSet}
                      title={
                        loopIsSet
                          ? loop.enabled
                            ? "Désactiver la boucle"
                            : "Activer la boucle"
                          : "Placez d'abord un début et une fin"
                      }
                    >
                      {loop.enabled ? (
                        <TbRepeat size={15} />
                      ) : (
                        <TbRepeatOff size={15} />
                      )}
                    </button>
                  </span>
                </div>
              </>
            )}
            </div>
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
