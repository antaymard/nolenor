// Cellules `richtext` d'un node table, côté agent : Markdown dans les deux sens.
//
// Même contrat que `set_node_data` sur un node blocknote : l'agent écrit du
// Markdown, avec les jetons `[[node:…]]`, `[[date:…]]` et `[[pill:…]]`, et
// relit la cellule sous la même forme. Avant, une cellule n'acceptait que du
// texte brut (un paragraphe par ligne) et revenait aplatie en texte : ni mise
// en forme ni mention possibles, et rien de ce que l'utilisateur avait mis en
// forme ne se voyait.
//
// Les conversions passent par le BlockNote headless (jsdom) : ce module ne
// sert qu'aux tools, jamais à `convex/lib`, importé aussi par le front.

import type { ToolCtx } from "@convex-dev/agent";
import type { Id } from "../../_generated/dataModel";
import {
  collectMentionedNodeDataIds,
  normalizeReplaceDocumentBlocks,
  stringifyBlockNoteDocumentForStorage,
  type BlockNoteBlock,
} from "../../lib/blockNoteDocument";
import { parseRichTextCell } from "../../lib/tableRichTextCell";
import {
  blockNoteDocumentsToMarkdown,
  findMalformedDateTokens,
  findMalformedPillTokens,
  findUnresolvedMentionTokens,
  malformedDateTokensError,
  malformedPillTokensError,
  markdownToBlockNoteBlocks,
  type MentionInfoByNodeDataId,
} from "./blockNoteMarkdown";
import {
  resolveNodeMentionTokens,
  unresolvedMentionTokensError,
} from "./resolveNodeMentionTokens";

export type RichTextCellFromMarkdownResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Markdown écrit par l'agent → document stocké dans la cellule (ou `null` pour
 * un Markdown vide). L'erreur est un message brut, à passer à `toolError`.
 *
 * `<br>` redevient un saut de ligne avant le parsing : c'est ainsi que
 * `read_nodes` rend les sauts de ligne d'une cellule (une ligne de tableau
 * Markdown ne peut pas en contenir), et le parser de BlockNote jette les
 * balises HTML — une cellule recopiée telle quelle perdait ses sauts. Pour la
 * même raison, `read_nodes` échappe les `|` en `\|`, jusque dans les jetons
 * (`[[node:id\|type\|titre]]`) : sans les rétablir, l'id lu serait `id\` et
 * la mention ne se résoudrait pas.
 */
export async function richTextCellFromMarkdown(
  ctx: ToolCtx,
  canvasId: Id<"canvases">,
  markdown: string,
): Promise<RichTextCellFromMarkdownResult> {
  const source = markdown
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\[\[[^\]]*\]\]/g, (token) => token.replace(/\\\|/g, "|"));
  const mentions = await resolveNodeMentionTokens(ctx, canvasId, source);
  const blocks = await markdownToBlockNoteBlocks(source, { mentions });
  if (blocks.length === 0) return { ok: true, value: null };

  const unresolved = findUnresolvedMentionTokens(blocks);
  if (unresolved.length > 0) {
    return { ok: false, error: unresolvedMentionTokensError(unresolved) };
  }
  const malformedDates = findMalformedDateTokens(blocks);
  if (malformedDates.length > 0) {
    return { ok: false, error: malformedDateTokensError(malformedDates) };
  }
  const malformedPills = findMalformedPillTokens(blocks);
  if (malformedPills.length > 0) {
    return { ok: false, error: malformedPillTokensError(malformedPills) };
  }

  return {
    ok: true,
    value: stringifyBlockNoteDocumentForStorage(
      normalizeReplaceDocumentBlocks(blocks),
    ),
  };
}

type RichTextTableLike = {
  columns?: Array<{ id: string; type?: string }>;
  rows?: Array<{ id: string; cells?: Record<string, unknown> }>;
};

/** Clé d'une cellule dans la map rendue par `renderRichTextCellsAsMarkdown`. */
export function richTextCellKey(rowId: string, columnId: string): string {
  return `${rowId}\u0000${columnId}`;
}

function eachRichTextCell(
  table: RichTextTableLike,
  rowIds: ReadonlySet<string> | undefined,
  visit: (key: string, blocks: BlockNoteBlock[]) => void,
): void {
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const richTextColumnIds = columns
    .filter((col) => col.type === "richtext")
    .map((col) => col.id);
  if (richTextColumnIds.length === 0) return;

  for (const row of rows) {
    if (rowIds && !rowIds.has(row.id)) continue;
    for (const colId of richTextColumnIds) {
      const blocks = parseRichTextCell(row.cells?.[colId]);
      if (blocks) visit(richTextCellKey(row.id, colId), blocks);
    }
  }
}

/** Les `nodeDataId` mentionnés dans les cellules rich text d'une table. */
export function collectTableRichTextMentions(table: unknown): string[] {
  const ids = new Set<string>();
  eachRichTextCell((table ?? {}) as RichTextTableLike, undefined, (_, blocks) => {
    for (const id of collectMentionedNodeDataIds(blocks)) ids.add(id);
  });
  return [...ids];
}

/**
 * Rend en Markdown les cellules rich text des lignes `rowIds`, clé
 * `richTextCellKey(rowId, columnId)`. Limité aux lignes affichées : une
 * grande table ne paie pas la conversion de lignes qu'elle ne montre pas.
 */
export async function renderRichTextCellsAsMarkdown(
  table: unknown,
  rowIds: readonly string[],
  mentions?: MentionInfoByNodeDataId,
): Promise<Map<string, string>> {
  const keys: string[] = [];
  const docs: BlockNoteBlock[][] = [];
  eachRichTextCell(
    (table ?? {}) as RichTextTableLike,
    new Set(rowIds),
    (key, blocks) => {
      keys.push(key);
      docs.push(blocks);
    },
  );
  const rendered = await blockNoteDocumentsToMarkdown(docs, { mentions });
  return new Map(keys.map((key, i) => [key, rendered[i]] as const));
}
