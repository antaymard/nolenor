import type { Doc, Id } from "@/../convex/_generated/dataModel";
import {
  findMentionsOfNode,
  parseStoredBlockNoteDocument,
} from "@/../convex/lib/blockNoteDocument";
import { parseRichTextCell } from "@/../convex/lib/tableRichTextCell";
import type {
  CellValue,
  LinkCellValue,
  NodeCellValue,
  SelectCellValue,
  TableData,
} from "@/components/table/types";

export interface Backlink {
  sourceNodeDataId: Id<"nodeDatas">;
  kind: "blocknote" | "table-node-cell" | "table-richtext";
  snippet: string;
}

function isNodeCellValue(value: CellValue): value is NodeCellValue {
  return (
    !!value &&
    typeof value === "object" &&
    "nodeId" in value &&
    typeof (value as NodeCellValue).nodeId === "string"
  );
}

/** Short, human-readable text for one cell — enough to identify a row in a hover preview. */
function cellToText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "✓" : "";
  if (Array.isArray(value)) return (value as SelectCellValue).join(", ");
  if (isNodeCellValue(value)) return "";
  if ("pageTitle" in value) return (value as LinkCellValue).pageTitle;
  return "";
}

function rowSnippet(table: TableData, row: TableData["rows"][number]): string {
  const parts: string[] = [];
  for (const column of table.columns) {
    if (column.type === "node") continue;
    const text = cellToText(row.cells[column.id]).trim();
    if (text) parts.push(text);
    if (parts.length >= 3) break;
  }
  return parts.join(" · ");
}

/**
 * Every reference to `targetNodeDataId` found across the canvas's already-loaded
 * nodeDatas: `@mention` pills in blocknote documents (including table richtext
 * columns), and table "node"-column cells. Computed on demand (Links tab
 * activation), not kept live — see the panel's usage for the tradeoff.
 *
 * `targetXyNodeId` is needed separately from `targetNodeDataId`: table
 * node-cells store the canvas node id, not the nodeDataId (see
 * `src/components/table/types.ts`'s `NodeCellValue`).
 */
export function findBacklinks(
  targetNodeDataId: Id<"nodeDatas">,
  targetXyNodeId: string,
  nodeDatas: ReadonlyMap<Id<"nodeDatas">, Doc<"nodeDatas">>,
): Backlink[] {
  const backlinks: Backlink[] = [];

  for (const nodeData of nodeDatas.values()) {
    if (nodeData._id === targetNodeDataId) continue;

    if (nodeData.type === "blocknote") {
      const blocks = parseStoredBlockNoteDocument(nodeData.values?.doc);
      if (!blocks) continue;
      for (const hit of findMentionsOfNode(blocks, targetNodeDataId)) {
        backlinks.push({
          sourceNodeDataId: nodeData._id,
          kind: "blocknote",
          snippet: hit.snippet,
        });
      }
      continue;
    }

    if (nodeData.type === "table") {
      const table = nodeData.values?.table as TableData | undefined;
      if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
        continue;
      }
      const nodeColumnIds = table.columns
        .filter((c) => c.type === "node")
        .map((c) => c.id);
      const richTextColumnIds = table.columns
        .filter((c) => c.type === "richtext")
        .map((c) => c.id);

      for (const row of table.rows) {
        for (const colId of nodeColumnIds) {
          const cell = row.cells[colId];
          if (isNodeCellValue(cell) && cell.nodeId === targetXyNodeId) {
            backlinks.push({
              sourceNodeDataId: nodeData._id,
              kind: "table-node-cell",
              snippet: rowSnippet(table, row),
            });
          }
        }
        for (const colId of richTextColumnIds) {
          const blocks = parseRichTextCell(row.cells[colId]);
          if (!blocks) continue;
          if (findMentionsOfNode(blocks, targetNodeDataId).length > 0) {
            backlinks.push({
              sourceNodeDataId: nodeData._id,
              kind: "table-richtext",
              snippet: rowSnippet(table, row),
            });
          }
        }
      }
    }
  }

  return backlinks;
}
