import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import { blockNoteBlocksToMarkdown } from "@/lib/blockNoteMarkdownConverter";
import type { PartialBlock } from "@blocknote/core";
import type { NodeData } from "@/types/convex";

export type SourceNode = {
  id: string;
  type: string;
  name: string;
  // table
  columns?: { id: string; name: string; type: string }[];
  rows?: Record<string, unknown>[];
  // blocknote
  markdown?: string;
  // value
  value?: string | number;
  label?: string;
  unit?: string;
  // image
  url?: string;
  images?: { url: string }[];
  // link
  title?: string;
  // title node (heading)
  text?: string;
  level?: string;
  // pdf
  files?: { url: string; filename: string; mimeType?: string }[];
};

export function resolveSourceNode(
  nodeData: NodeData,
  nodeId: string,
): SourceNode {
  const type = nodeData.type;
  const name = getNodeDataTitle(nodeData);
  const base: SourceNode = { id: nodeId, type, name };

  switch (type) {
    case "table": {
      const table = nodeData.values?.table as
        | { columns?: SourceNode["columns"]; rows?: SourceNode["rows"] }
        | undefined;
      const flatRows = table?.rows?.map((row) => {
        const { cells, ...rest } = row;
        return { ...rest, ...((cells as Record<string, unknown>) ?? {}) };
      });
      return { ...base, columns: table?.columns, rows: flatRows };
    }
    case "value": {
      const val = nodeData.values?.value as
        | { value?: string | number; label?: string; unit?: string }
        | undefined;
      return { ...base, value: val?.value, label: val?.label, unit: val?.unit };
    }
    case "blocknote": {
      const parsedDoc = parseStoredBlockNoteDocument(nodeData.values?.doc);
      const result = parsedDoc?.length
        ? blockNoteBlocksToMarkdown(parsedDoc as unknown as PartialBlock[])
        : null;
      return {
        ...base,
        markdown: result?.status === "ok" ? result.markdown : undefined,
      };
    }
    case "image": {
      const images = nodeData.values?.images as
        | Array<{ url?: string }>
        | undefined;
      const validImages = images?.filter(
        (img) => typeof img.url === "string",
      ) as { url: string }[] | undefined;
      return { ...base, images: validImages ?? [], url: validImages?.[0]?.url };
    }
    case "link": {
      const link = nodeData.values?.link as
        | { href?: string; pageTitle?: string }
        | undefined;
      return { ...base, url: link?.href, title: link?.pageTitle };
    }
    case "title": {
      const text = nodeData.values?.text as string | undefined;
      const level = nodeData.values?.level as string | undefined;
      return { ...base, text, level };
    }
    case "pdf": {
      const files = nodeData.values?.files as
        | Array<{ url: string; filename: string; mimeType?: string }>
        | undefined;
      return { ...base, files };
    }
    default:
      return base;
  }
}
