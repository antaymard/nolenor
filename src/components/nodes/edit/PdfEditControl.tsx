import { useState } from "react";
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
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { WindowEditTrigger } from "./WindowEditTrigger";
import type { NodeEditTriggerVariant } from "./WindowEditTrigger";

export type PdfStoredFile = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
};

const defaultValue: PdfStoredFile[] = [];

interface PdfEditControlProps {
  nodeDataId: Id<"nodeDatas"> | undefined;
  variant?: NodeEditTriggerVariant;
}

/**
 * Bouton Edit + popover d'édition d'un PDF (remplacement du fichier + titre),
 * partagé entre la toolbar du node canvas et le header des windows (flottante
 * et plein écran). Le contenu du popover vit ici une seule fois (DRY).
 */
export function PdfEditControl({
  nodeDataId,
  variant = "toolbar",
}: PdfEditControlProps) {
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  const currentValue =
    (values?.files as PdfStoredFile[] | undefined) ?? defaultValue;
  const file = currentValue.length > 0 ? currentValue[0] : null;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<PdfStoredFile | null>(null);

  const handleUploadComplete = (fileData: {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: number;
    key: string;
  }) => {
    setPendingFile(fileData);
    setTitleDraft(fileData.filename);
  };

  const handleSave = () => {
    if (!nodeDataId) {
      setIsPopoverOpen(false);
      return;
    }

    const sourceFile = pendingFile ?? file;
    if (!sourceFile) {
      setIsPopoverOpen(false);
      return;
    }

    const nextFilename = titleDraft.trim() || sourceFile.filename;

    // Avoid redundant mutation when only opening/saving without any actual change.
    if (!pendingFile && file && nextFilename === file.filename) {
      setIsPopoverOpen(false);
      return;
    }

    updateNodeDataValues({
      nodeDataId,
      values: { files: [{ ...sourceFile, filename: nextFilename }] },
    });

    setPendingFile(null);
    setIsPopoverOpen(false);
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      setTitleDraft((pendingFile ?? file)?.filename ?? "");
    }
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        {variant === "toolbar" ? (
          <NodeToolbarButton label="Edit" title="Edit PDF">
            <TbPencil />
          </NodeToolbarButton>
        ) : (
          <WindowEditTrigger title="Edit PDF" />
        )}
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <UploadFile
            accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,text/markdown,application/json,application/xml,application/zip,audio/*,video/*"
            onUploadComplete={handleUploadComplete}
          />
          <Input
            onDoubleClick={(e) => e.stopPropagation()}
            type="text"
            placeholder="Title (optional)"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
