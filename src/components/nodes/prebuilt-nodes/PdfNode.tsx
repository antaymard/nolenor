import { memo } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { RiAttachment2 } from "react-icons/ri";
import { TbDownload, TbExternalLink, TbMaximize } from "react-icons/tb";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import NodeEmptyState from "../NodeEmptyState";
import { PdfEditControl } from "../edit/PdfEditControl";
import type { PdfStoredFile } from "../edit/PdfEditControl";
import { useDownloadFile } from "@/hooks/useDownloadFile";
import { useWindowsStore } from "@/stores/windowsStore";
import type { XyNodeProps } from "@/types/domain";

type PdfValue = PdfStoredFile;

const defaultValue: PdfValue[] = [];

function PdfNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const { downloadStoredFile } = useDownloadFile();
  const openWindow = useWindowsStore((s) => s.openWindow);

  const currentValue =
    (values?.files as PdfValue[] | undefined) ?? defaultValue;
  const file = currentValue.length > 0 ? currentValue[0] : null;

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
          <NodeToolbarButton
            label="Open"
            onClick={() => {
              if (!nodeDataId) return;
              openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "pdf" });
            }}
          >
            <TbMaximize />
          </NodeToolbarButton>
        )}
        {file && (
          <NodeToolbarButton
            label="Download"
            title="Download"
            onClick={handleDownload}
          >
            <TbDownload />
          </NodeToolbarButton>
        )}
        <PdfEditControl nodeDataId={nodeDataId} />
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        {file ? (
          <div className="h-full w-full flex items-center gap-2 px-2 min-w-0 relative group/pdfnode">
            <RiAttachment2 size={18} className="shrink-0" />
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
          </div>
        ) : (
          <NodeEmptyState
            icon={<RiAttachment2 size={18} />}
            title="No PDF"
            action="pencil"
            compact
          />
        )}
      </NodeFrame>
    </>
  );
}

export default memo(PdfNode, areNodePropsEqual);
