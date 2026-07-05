import type { BaseFieldProps } from "@/types/ui";
import { useCallback } from "react";
import { useNodeSidePanel } from "../../nodes/side-panels/NodeSidePanelContext";
import SidePanelFrame from "../../nodes/side-panels/SidePanelFrame";
import { UploadFile } from "../UploadFile";
import { TbPencil, TbExternalLink } from "react-icons/tb";
import { RiAttachment2 } from "react-icons/ri";

export type FileFieldType = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
};

const sidePanelId = "fileEdition";

interface FileNameFieldProps extends BaseFieldProps<FileFieldType[]> {
  className?: string;
}

export default function FileNameField({
  field,
  value,
  onChange,
  visualSettings,
  className = "",
}: FileNameFieldProps) {
  const { closeSidePanel, openSidePanel } = useNodeSidePanel();
  const fileUrl = value && value.length > 0 ? value[0].url : "";

  const handleSave = useCallback(
    (newValue: FileFieldType) => {
      console.log("Saved file:", newValue);
      onChange?.([newValue]);
      closeSidePanel(sidePanelId);
    },
    [onChange, closeSidePanel]
  );

  return (
    <div
      className={
        "relative bg-muted hover:bg-accent h-8 rounded-md flex items-center group/linkfield w-full px-2 gap-2 min-w-0 flex-1" +
        className
      }
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <RiAttachment2 size={16} className="shrink-0" />
        {value && value.length > 0 ? (
          <p className="truncate">{value[0].filename}</p>
        ) : (
          <p className="text-muted-foreground">Aucun fichier</p>
        )}
      </span>
      <span className="absolute right-2 cursor-default flex gap-1 bg-inherit">
        {value && value.length > 0 && (
          <button
            type="button"
            onClick={() => window.open(value[0].url, "_blank")}
            className="cursor-default hover:bg-black/5 rounded-sm items-center justify-center h-6 w-6 shrink-0 group-hover/linkfield:flex hidden"
            title="Open file"
          >
            <TbExternalLink />
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            openSidePanel(
              sidePanelId,
              <FileUploaderSidePanel
                initialValue={fileUrl}
                onSave={handleSave}
                onClose={() => closeSidePanel(sidePanelId)}
              />
            )
          }
          className=" hover:bg-black/5 rounded-sm items-center justify-center h-6 w-6 shrink-0 group-hover/linkfield:flex hidden"
        >
          <TbPencil />
        </button>
      </span>
    </div>
  );
}

function FileUploaderSidePanel({ initialValue, onSave, onClose }) {
  const handleUploadComplete = (fileData: FileFieldType) => {
    onSave(fileData);
  };

  return (
    <SidePanelFrame
      id={sidePanelId}
      title="Edit file"
      className="w-64"
    >
      <UploadFile
        onUploadComplete={handleUploadComplete}
        accept="application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, text/plain, text/csv, text/markdown, application/json, application/xml, application/zip, application/x-rar-compressed, application/x-7z-compressed, audio/mpeg, audio/wav, audio/ogg, video/mp4, video/webm"
      />
    </SidePanelFrame>
  );
}
