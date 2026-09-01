import { memo, useState } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { RiAttachment2 } from "react-icons/ri";
import { TbDownload, TbExternalLink, TbMaximize, TbPencil } from "react-icons/tb";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Input } from "@/components/shadcn/input";
import { UploadFile } from "@/components/fields/UploadFile";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useDownloadFile } from "@/hooks/useDownloadFile";
import { useWindowsStore } from "@/stores/windowsStore";
import type { XyNodeProps } from "@/types/domain";

type PdfValue = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
};

const defaultValue: PdfValue[] = [];

function PdfNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { downloadStoredFile } = useDownloadFile();
  const openWindow = useWindowsStore((s) => s.openWindow);

  const currentValue =
    (values?.files as PdfValue[] | undefined) ?? defaultValue;
  const file = currentValue.length > 0 ? currentValue[0] : null;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<PdfValue | null>(null);

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

  const isPdf = file?.mimeType === "application/pdf";

  const handleDownload = async () => {
    // Séquentiel : plusieurs téléchargements déclenchés dans la même frame se
    // font désarmer par les navigateurs.
    for (const f of currentValue) {
      await downloadStoredFile({
        key: f.key,
        url: f.url,
        filename: f.filename,
      });
    }
  };

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        {isPdf && (
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              if (!nodeDataId) return;
              openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "pdf" });
            }}
          >
            <TbMaximize />
          </Button>
        )}
        {file && (
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
            <Button variant="outline" size="icon" title="Edit PDF">
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        <div className="h-full w-full flex items-center gap-2 px-2 min-w-0 relative group/pdfnode">
          <RiAttachment2 size={18} className="shrink-0" />
          {file ? (
            <>
              <p className="truncate flex-1 min-w-0">{file.filename}</p>
              {xyNode.selected && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-background hover:bg-muted rounded-sm p-1 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TbExternalLink size={16} />
                </a>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No PDF</p>
          )}
        </div>
      </NodeFrame>
    </>
  );
}

export default memo(PdfNode, areNodePropsEqual);
