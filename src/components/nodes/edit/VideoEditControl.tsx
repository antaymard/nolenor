import { useCallback, useState } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { TbPencil } from "react-icons/tb";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
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
import { captureVideoPoster, posterFileFrom } from "@/lib/videoPoster";
import { WindowEditTrigger } from "./WindowEditTrigger";
import type { NodeEditTriggerVariant } from "./WindowEditTrigger";

export type VideoValue = {  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
  duration: number;
  width: number;
  height: number;
  label?: string;
  poster?: { url: string; key: string } | null;
};

/** Mirrors getNodeDataTitle: what the user typed, then the filename. */
function displayNameOf(video: VideoValue | null): string {
  if (!video) return "";
  return video.label?.trim() || video.filename;
}

interface VideoEditControlProps {
  nodeDataId: Id<"nodeDatas"> | undefined;
  variant?: NodeEditTriggerVariant;
}

/**
 * Bouton Edit + popover d'édition d'une vidéo (remplacement du fichier +
 * renommage via `label`, jamais `filename`), partagé entre la toolbar du node
 * canvas et le header des windows (flottante et plein écran). Le contenu du
 * popover vit ici une seule fois (DRY).
 */
export function VideoEditControl({
  nodeDataId,
  variant = "toolbar",
}: VideoEditControlProps) {
  const video =
    useNodeDataValuesField<VideoValue | null>(nodeDataId, "video") ?? null;

  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { uploadFile } = useFileUpload();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

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

      const captured = await captureVideoPoster(file);

      let poster: { url: string; key: string } | null = null;
      if (captured.poster) {
        try {
          const uploaded = await uploadFile(posterFileFrom(captured.poster));
          poster = { url: uploaded.url, key: uploaded.key };
        } catch (error) {
          console.warn("[VideoEditControl] poster upload failed", error);
        }
      }

      // One write for the whole gesture: splitting it would create two
      // versions and run the R2 reference sync twice.
      updateNodeDataValues({
        nodeDataId,
        values: {
          video: {
            ...fileData,
            duration: captured.duration ?? 0,
            width: captured.width ?? 0,
            height: captured.height ?? 0,
            poster,
          },
        },
      });
    },
    [nodeDataId, updateNodeDataValues, uploadFile],
  );

  const displayName = displayNameOf(video);

  const handleRename = useCallback(() => {
    if (!nodeDataId || !video) {
      setIsPopoverOpen(false);
      return;
    }
    const next = titleDraft.trim();
    // Writes `label`, never `filename`: renaming the node must not change the
    // name the file is downloaded under.
    if (next && next !== displayNameOf(video)) {
      updateNodeDataValues({
        nodeDataId,
        values: { video: { ...video, label: next } },
      });
    }
    setIsPopoverOpen(false);
  }, [nodeDataId, titleDraft, updateNodeDataValues, video]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) setTitleDraft(displayName);
    },
    [displayName],
  );

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        {variant === "toolbar" ? (
          <NodeToolbarButton
            label="Edit"
            title={video ? "Rename or replace" : "Add a file"}
          >
            <TbPencil />
          </NodeToolbarButton>
        ) : (
          <WindowEditTrigger
            title={video ? "Rename or replace" : "Add a file"}
          />
        )}
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleRename();
          }}
        >
          <UploadFile
            accept="video/*"
            onUploadComplete={handleUploadComplete}
          />
          {video && (
            <>
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="File name"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
              />
              <Button type="submit" size="sm">
                Save
              </Button>
            </>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}
