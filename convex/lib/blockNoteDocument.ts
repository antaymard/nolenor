// BlockNote document domain layer.
//
// Pure, runtime-agnostic operations on the BlockNote block tree that is stored
// as a JSON string in `nodeDatas.values.doc`. No DOM / jsdom dependency: these
// are plain array transformations that leave untouched blocks byte-identical
// (a deep clone is taken so the original array is never mutated in place).
//
// This module is the single source of truth for what a valid stored BlockNote
// document is, and for the structural edits applied by the agent tools. The
// XML <-> BlockNote conversion (which needs jsdom) lives in
// `convex/ia/helpers/blockNoteMarkdown.ts`.

import { countExactMatches } from "./text";

// ── Types ───────────────────────────────────────────────────────────────────

export type BlockNoteInlineContent =
  | string
  | {
      type: string;
      text?: string;
      styles?: Record<string, unknown>;
      content?: BlockNoteInlineContent[];
      href?: string;
      [key: string]: unknown;
    };

export type BlockNoteTableCellProps = {
  backgroundColor: string;
  textColor: string;
  textAlignment: "left" | "center" | "right" | "justify";
  colspan?: number;
  rowspan?: number;
};

export type BlockNoteTableCell = {
  type: "tableCell";
  props: BlockNoteTableCellProps;
  content: BlockNoteInlineContent[];
};

export type BlockNoteTableContent = {
  type: "tableContent";
  columnWidths?: (number | undefined)[];
  headerRows?: number;
  headerCols?: number;
  rows: Array<{
    cells: BlockNoteTableCell[] | BlockNoteInlineContent[][];
  }>;
};

export type BlockNoteBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BlockNoteBlock[];
};

export type NewBlockInput = {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: NewBlockInput[];
};

export type BlockNoteBlockWithOptionalId = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BlockNoteBlockWithOptionalId[];
};

// ── Frozen v1 block defaults ────────────────────────────────────────────────
// These match BlockNote 0.51.3 default block specs plus the app's custom
// `callout` block (src/components/blocknote/callout-block.tsx). The codec uses
// them to omit default props from XML attributes for readability.

export const BLOCK_NOTE_DEFAULT_PROPS: Record<string, Record<string, unknown>> = {
  paragraph: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  heading: { backgroundColor: "default", textColor: "default", textAlignment: "left", level: 1, isToggleable: false },
  bulletListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  numberedListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  checkListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left", checked: false },
  toggleListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  quote: { backgroundColor: "default", textColor: "default" },
  codeBlock: { language: "text" },
  table: { textColor: "default" },
  image: { textAlignment: "left", backgroundColor: "default", name: "", url: "", caption: "", showPreview: true },
  video: { textAlignment: "left", backgroundColor: "default", name: "", url: "", caption: "", showPreview: true },
  audio: { backgroundColor: "default", name: "", url: "", caption: "", showPreview: true },
  file: { backgroundColor: "default", name: "", url: "", caption: "" },
  divider: {},
  callout: { color: "default", icon: "💡" },
};

export const BLOCK_NOTE_DEFAULT_CELL_PROPS: BlockNoteTableCellProps = {
  backgroundColor: "default",
  textColor: "default",
  textAlignment: "left",
  colspan: 1,
  rowspan: 1,
};

/** Compact props: remove keys whose value equals the frozen default for the block type. */
export function compactBlockProps(type: string, props: unknown): Record<string, unknown> | null {
  if (!props || typeof props !== "object") return null;
  const p = props as Record<string, unknown>;
  const defaults = BLOCK_NOTE_DEFAULT_PROPS[type] ?? {};
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(p)) {
    const val = p[key];
    if (key in defaults && val === defaults[key]) continue;
    filtered[key] = val;
  }
  return Object.keys(filtered).length === 0 ? null : filtered;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class InvalidBlockNoteDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBlockNoteDocumentError";
  }
}

export class BlockNotFoundError extends Error {
  constructor(blockId: string, validIds: string[]) {
    const sample = validIds.slice(0, 30).join(", ");
    const truncated = validIds.length > 30 ? `… (${validIds.length} total)` : "";
    super(
      `Block id "${blockId}" was not found. Valid block ids: ${sample}${truncated}`,
    );
    this.name = "BlockNotFoundError";
  }
}

export class BlockNotePatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockNotePatchError";
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Paths are plain strings built by concatenation as the walk descends
// (`[0][children][2][content]`). Validation runs on every write, so the path
// must cost one string concat per node — never an array allocation — and
// `"root"` stands in for the empty path in error messages.
type Path = string;

const ROOT_PATH: Path = "";

function childPath(path: Path, ...segments: (string | number)[]): Path {
  return `${path}[${segments.join("][")}]`;
}

function describePath(path: Path): string {
  return path === ROOT_PATH ? "root" : path;
}

// ── IDs ─────────────────────────────────────────────────────────────────────

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const ID_LENGTH = 21;

function randomBytes(n: number): Uint8Array {
  const c = (
    globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }
  ).crypto;
  if (c && typeof c.getRandomValues === "function") {
    const arr = new Uint8Array(n);
    c.getRandomValues(arr);
    return arr;
  }
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

export function generateBlockId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

/** Generate a block id that is not in `existing`. */
function generateUniqueBlockId(existing: Set<string>): string {
  let id: string;
  do {
    id = generateBlockId();
  } while (existing.has(id));
  existing.add(id);
  return id;
}

// ── Validation ───────────────────────────────────────────────────────────────

// Custom inline content types the frontend schema declares (see
// src/components/blocknote/registry.tsx `customInlineContentSpecs`). Duplicated
// here rather than imported so this module stays free of any React/BlockNote
// dependency — keep in sync with the registry when adding a new inline type.
const CUSTOM_INLINE_CONTENT_TYPES = ["date", "mention"] as const;

// The only inline leaf types BlockNote's real schema can ever produce: "text"
// and "link" (@blocknote/core's `defaultInlineContentSpecs`) plus the app's
// custom inline content above. A node with any other `type` — most notably a
// block object like `{type: "paragraph", content: [...]}` smuggled into a
// table cell's content array — can never come out of a real editor, and
// building one into the document is exactly what makes
// `BlockNoteEditor.create()` crash downstream (see safeCreateEditor.ts /
// BlocknoteWindow.tsx for the client-side backstop, and this function for
// where it should be rejected before it is ever persisted).
const KNOWN_INLINE_TYPES = new Set<string>([
  "text",
  "link",
  ...CUSTOM_INLINE_CONTENT_TYPES,
]);

function validateTextLeaf(n: Record<string, unknown>, p: Path): void {
  if (typeof n.text !== "string") {
    throw new InvalidBlockNoteDocumentError(
      `Invalid text node at ${describePath(p)}: missing or non-string "text".`,
    );
  }
  if (n.styles !== undefined && !isPlainObj(n.styles)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid text node at ${describePath(p)}: "styles" must be an object.`,
    );
  }
  if (n.content !== undefined) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid text node at ${describePath(p)}: a text leaf cannot have "content".`,
    );
  }
}

function validateInlineContent(content: unknown, path: Path): void {
  if (typeof content === "string") return;

  if (!Array.isArray(content)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid content at ${describePath(path)}: expected string, array, or table content, got ${
        content === null ? "null" : typeof content
      }.`,
    );
  }

  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    const p = childPath(path, "content", i);
    if (typeof node === "string") continue;
    if (!isPlainObj(node)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid inline node at ${describePath(p)}: expected object or string.`,
      );
    }
    const n = node as Record<string, unknown>;
    if (typeof n.type !== "string" || n.type.length === 0) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid inline node at ${describePath(p)}: missing or empty "type" string.`,
      );
    }
    if (!KNOWN_INLINE_TYPES.has(n.type)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid inline node at ${describePath(p)}: unknown inline type "${n.type}". A block cannot appear as inline content. Expected one of: ${[...KNOWN_INLINE_TYPES].join(", ")}.`,
      );
    }
    if (n.type === "text") {
      validateTextLeaf(n, p);
      continue;
    }
    if (n.type === "link") {
      if (typeof n.href !== "string") {
        throw new InvalidBlockNoteDocumentError(
          `Invalid link node at ${describePath(p)}: missing or non-string "href".`,
        );
      }
      if (!Array.isArray(n.content)) {
        throw new InvalidBlockNoteDocumentError(
          `Invalid link node at ${describePath(p)}: "content" must be an array of text nodes.`,
        );
      }
      const cp = childPath(p, "content");
      for (let j = 0; j < n.content.length; j++) {
        const c = n.content[j];
        const jp = childPath(cp, j);
        // A link's content can only ever be styled text — never another
        // link or a custom inline atom (BlockNote's own type,
        // `Link<T> = { content: StyledText<T>[] }`, does not allow it).
        if (!isPlainObj(c) || (c as Record<string, unknown>).type !== "text") {
          throw new InvalidBlockNoteDocumentError(
            `Invalid link content at ${describePath(jp)}: a link can only contain text nodes.`,
          );
        }
        validateTextLeaf(c as Record<string, unknown>, jp);
      }
      continue;
    }
    // Custom inline atom (e.g. "date"): props-only, no nested content.
    if (n.content !== undefined) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid inline node at ${describePath(p)}: type "${n.type}" cannot have "content".`,
      );
    }
    if (n.props !== undefined && !isPlainObj(n.props)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid inline node at ${describePath(p)}: "props" must be an object.`,
      );
    }
  }
}

function isTableCell(cell: unknown): cell is BlockNoteTableCell {
  return isPlainObj(cell) && (cell as Record<string, unknown>).type === "tableCell";
}

/** colspan/rowspan default to 1; only a structured `tableCell` can override them. */
function getCellSpan(cell: unknown, key: "colspan" | "rowspan"): number {
  if (!isTableCell(cell)) return 1;
  const value = (cell.props as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" && value >= 1 ? value : 1;
}

/**
 * Replica of `@blocknote/core`'s `getTableCellOccupancyGrid`
 * (api/blockManipulation/tables/tables.ts) — not imported because that module
 * isn't part of the package's public export surface. `tableContentToNodes`
 * (api/nodeConversions/blockToNode.ts) runs this exact algorithm on every cell
 * during `BlockNoteEditor.create()`, and throws if it finds an overlap or an
 * overflow — so this check accepts exactly the tables a real editor accepts
 * (including legitimate colspan/rowspan, where a spanned-over row has fewer
 * `cells` entries than the table's width) and rejects exactly what would
 * otherwise crash construction downstream.
 */
function validateTableOccupancy(
  rows: Array<{ cells: unknown[] }>,
  path: Path,
): void {
  const height = rows.length;
  let width = 0;
  for (const row of rows) {
    let rowWidth = 0;
    for (const cell of row.cells) rowWidth += getCellSpan(cell, "colspan");
    width = Math.max(width, rowWidth);
  }
  if (height === 0 || width === 0) return;

  const grid: boolean[][] = Array.from({ length: height }, () =>
    new Array(width).fill(false),
  );

  const findNextAvailable = (row: number, col: number): { row: number; col: number } => {
    for (let i = row; i < height; i++) {
      for (let j = col; j < width; j++) {
        if (!grid[i][j]) return { row: i, col: j };
      }
    }
    throw new InvalidBlockNoteDocumentError(
      `Invalid table at ${describePath(path)}: more cells than the table's computed grid has room for.`,
    );
  };

  for (let r = 0; r < rows.length; r++) {
    let searchCol = 0;
    for (let ci = 0; ci < rows[r].cells.length; ci++) {
      const cell = rows[r].cells[ci];
      const rowspan = getCellSpan(cell, "rowspan");
      const colspan = getCellSpan(cell, "colspan");
      const { row: startRow, col: startCol } = findNextAvailable(r, searchCol);

      if (startRow + rowspan > height || startCol + colspan > width) {
        throw new InvalidBlockNoteDocumentError(
          `Invalid table at ${describePath(childPath(path, "rows", r, "cells", ci))}: rowspan/colspan overflows the table's bounds.`,
        );
      }
      for (let i = startRow; i < startRow + rowspan; i++) {
        for (let j = startCol; j < startCol + colspan; j++) {
          if (grid[i][j]) {
            throw new InvalidBlockNoteDocumentError(
              `Invalid table at ${describePath(childPath(path, "rows", r, "cells", ci))}: cells overlap at row ${i}, column ${j}.`,
            );
          }
          grid[i][j] = true;
        }
      }
      searchCol = startCol + colspan;
    }
  }
}

function validateTableContent(content: unknown, path: Path): void {
  if (!isPlainObj(content)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid table content at ${describePath(path)}: expected object.`,
    );
  }
  const c = content as Record<string, unknown>;
  if (c.type !== "tableContent") {
    throw new InvalidBlockNoteDocumentError(
      `Invalid table content at ${describePath(path)}: expected type "tableContent", got ${String(c.type)}.`,
    );
  }
  if (!Array.isArray(c.rows)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid table content at ${describePath(path)}: "rows" must be an array.`,
    );
  }
  const rowsForOccupancy: Array<{ cells: unknown[] }> = [];
  for (let r = 0; r < c.rows.length; r++) {
    const row = c.rows[r];
    const rp = childPath(path, "rows", r);
    if (!isPlainObj(row)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid table row at ${describePath(rp)}: expected object.`,
      );
    }
    const cells = (row as Record<string, unknown>).cells;
    if (!Array.isArray(cells)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid table row at ${describePath(rp)}: "cells" must be an array.`,
      );
    }
    rowsForOccupancy.push({ cells });
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      const cp = childPath(rp, "cells", ci);
      if (isTableCell(cell)) {
        // Modern structured cell
        if (!isPlainObj(cell.props)) {
          throw new InvalidBlockNoteDocumentError(
            `Invalid table cell at ${describePath(cp)}: "props" must be an object.`,
          );
        }
        if (!Array.isArray(cell.content)) {
          throw new InvalidBlockNoteDocumentError(
            `Invalid table cell at ${describePath(cp)}: "content" must be an array.`,
          );
        }
        validateInlineContent(cell.content, childPath(cp, "content"));
      } else if (Array.isArray(cell)) {
        // Legacy array-of-inline-content cell
        validateInlineContent(cell, cp);
      } else {
        throw new InvalidBlockNoteDocumentError(
          `Invalid table cell at ${describePath(cp)}: expected a tableCell object or an inline content array.`,
        );
      }
    }
  }
  validateTableOccupancy(rowsForOccupancy, path);
}

function validateContent(content: unknown, path: Path): void {
  if (content === undefined || typeof content === "string") return;
  if (Array.isArray(content)) {
    validateInlineContent(content, path);
    return;
  }
  if (isPlainObj(content) && (content as Record<string, unknown>).type === "tableContent") {
    validateTableContent(content, path);
    return;
  }
  throw new InvalidBlockNoteDocumentError(
    `Invalid content at ${describePath(path)}: expected string, inline array, or table content.`,
  );
}

function collectBlockIds(block: unknown, path: Path, seen: Set<string>): void {
  if (!isPlainObj(block)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid block at ${describePath(path)}: expected object, got ${
        block === null ? "null" : typeof block
      }.`,
    );
  }
  const b = block as Record<string, unknown>;
  if (typeof b.id !== "string" || b.id.length === 0) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid block at ${describePath(path)}: missing or empty "id" string.`,
    );
  }
  if (seen.has(b.id)) {
    throw new InvalidBlockNoteDocumentError(
      `Duplicate block id "${b.id}" at ${describePath(path)}: block ids must be unique.`,
    );
  }
  seen.add(b.id);

  if (typeof b.type !== "string" || b.type.length === 0) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid block at ${describePath(path)} (id="${b.id}"): missing or empty "type" string.`,
    );
  }
  if (b.props !== undefined && !isPlainObj(b.props)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid block at ${describePath(path)} (id="${b.id}"): "props" must be an object.`,
    );
  }
  if (b.content !== undefined) {
    validateContent(b.content, childPath(path, "content"));
  }
  if (b.children !== undefined) {
    if (!Array.isArray(b.children)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid block at ${describePath(path)} (id="${b.id}"): "children" must be an array.`,
      );
    }
    for (let i = 0; i < b.children.length; i++) {
      collectBlockIds(b.children[i], childPath(path, "children", i), seen);
    }
  }
}

export function validateBlockNoteDocument(doc: unknown): void {
  if (!Array.isArray(doc)) {
    throw new InvalidBlockNoteDocumentError(
      `BlockNote document must be an array, got ${
        doc === null ? "null" : typeof doc
      }.`,
    );
  }
  const seen = new Set<string>();
  for (let i = 0; i < doc.length; i++) {
    collectBlockIds(doc[i], childPath(ROOT_PATH, i), seen);
  }
}

// ── Parsing & serialization ──────────────────────────────────────────────────

export function parseStoredBlockNoteDocument(doc: unknown): BlockNoteBlock[] | null {
  if (Array.isArray(doc)) return doc as BlockNoteBlock[];
  if (typeof doc === "string") {
    try {
      const parsed = JSON.parse(doc);
      return Array.isArray(parsed) ? (parsed as BlockNoteBlock[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function stringifyBlockNoteDocumentForStorage(doc: unknown): string {
  validateBlockNoteDocument(doc);
  return JSON.stringify(doc);
}

// ── Read-only traversal ──────────────────────────────────────────────────────

export function listBlockIds(blocks: BlockNoteBlock[]): string[] {
  const ids: string[] = [];
  const walk = (bs: BlockNoteBlock[]) => {
    for (const b of bs) {
      ids.push(b.id);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return ids;
}

export function findBlock(blocks: BlockNoteBlock[], id: string): BlockNoteBlock | null {
  const slot = locateBlock(blocks, id);
  return slot ? slot.siblings[slot.index] : null;
}

/**
 * Locate a block by id and return the array holding it plus its index — the one
 * primitive every targeted operation needs. Returning the slot (rather than the
 * block) lets insert/replace/delete mutate in place after a single walk instead
 * of searching the tree once per step.
 */
type BlockSlot = { siblings: BlockNoteBlock[]; index: number };

function locateBlock(blocks: BlockNoteBlock[], id: string): BlockSlot | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { siblings: blocks, index: i };
    const children = blocks[i].children;
    if (children) {
      const found = locateBlock(children, id);
      if (found) return found;
    }
  }
  return null;
}

/** Collect all ids reachable from a subtree (used by replace for ID collision checks). */
function listSubtreeIds(block: BlockNoteBlock): Set<string> {
  const ids = new Set<string>();
  const walk = (b: BlockNoteBlock) => {
    ids.add(b.id);
    if (b.children) for (const c of b.children) walk(c);
  };
  walk(block);
  return ids;
}

// ── Inline text extraction ───────────────────────────────────────────────────
// Single implementation shared by every surface that needs the visible text of
// a BlockNote document: node titles (getNodeDataTitle), the canvas empty-state
// check, the read-only renderer's code blocks, and the fullscreen outline.

/**
 * Concatenate the visible text of an inline content value. Accepts the three
 * shapes `content` can take: a raw string, an `InlineContent[]` array (text
 * leaves, links, custom inline nodes), or structured `tableContent`.
 * Custom inline nodes (e.g. `date` pills) carry no text and contribute "".
 */
export function extractInlineText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    let out = "";
    for (const node of content) {
      if (typeof node === "string") {
        out += node;
      } else if (isPlainObj(node)) {
        if (typeof node.text === "string") out += node.text;
        else if (node.content !== undefined) out += extractInlineText(node.content);
      }
    }
    return out;
  }

  if (isPlainObj(content) && content.type === "tableContent") {
    const rows = (content as unknown as BlockNoteTableContent).rows;
    if (!Array.isArray(rows)) return "";
    const cellTexts: string[] = [];
    for (const row of rows) {
      if (!isPlainObj(row) || !Array.isArray(row.cells)) continue;
      for (const cell of row.cells) {
        const text = extractInlineText(isTableCell(cell) ? cell.content : cell);
        if (text) cellTexts.push(text);
      }
    }
    return cellTexts.join(" ");
  }

  return "";
}

// Block types that are visible even with no text at all, so a document made
// only of them must not be reported as empty.
const NON_TEXTUAL_BLOCK_TYPES = new Set([
  "image",
  "video",
  "audio",
  "file",
  "table",
  "divider",
]);

/** True when an inline node is custom content (e.g. a `date` pill): no text, but real content. */
function isCustomInlineNode(node: unknown): boolean {
  return (
    isPlainObj(node) &&
    typeof node.type === "string" &&
    node.type !== "text" &&
    node.type !== "link"
  );
}

function inlineContentHasSubstance(content: unknown): boolean {
  if (typeof content === "string") return content.trim() !== "";
  if (Array.isArray(content)) {
    return content.some(
      (node) =>
        isCustomInlineNode(node) ||
        extractInlineText([node]).trim() !== "",
    );
  }
  if (isPlainObj(content) && content.type === "tableContent") return true;
  return false;
}

/**
 * True when the document has anything worth rendering: visible text, a custom
 * inline node (date pill), or a non-textual block (image, table, divider…).
 * Used by the canvas node to decide between the preview and the empty state.
 */
export function blockNoteDocumentHasText(blocks: readonly unknown[]): boolean {
  for (const block of blocks) {
    if (!isPlainObj(block)) continue;
    if (typeof block.type === "string" && NON_TEXTUAL_BLOCK_TYPES.has(block.type)) {
      return true;
    }
    if (inlineContentHasSubstance(block.content)) return true;
    if (Array.isArray(block.children) && blockNoteDocumentHasText(block.children)) {
      return true;
    }
  }
  return false;
}

// ── ID assignment ────────────────────────────────────────────────────────────

/** Recursively assign fresh unique ids to every block and descendant (used by insert). */
function regenerateIds(blocks: NewBlockInput[], existing: Set<string>): BlockNoteBlock[] {
  const assign = (b: NewBlockInput): BlockNoteBlock => {
    const out: BlockNoteBlock = { id: generateUniqueBlockId(existing), type: b.type };
    if (b.props !== undefined) out.props = b.props;
    if (b.content !== undefined) out.content = b.content;
    if (b.children && b.children.length > 0) {
      out.children = b.children.map(assign);
    }
    return out;
  };
  return blocks.map(assign);
}

/** Fill missing ids, reject duplicate supplied ids (used by full replacement). */
function ensureIds(blocks: BlockNoteBlockWithOptionalId[], existing: Set<string>): BlockNoteBlock[] {
  const ensure = (b: BlockNoteBlockWithOptionalId): BlockNoteBlock => {
    let id: string;
    if (b.id) {
      if (existing.has(b.id)) {
        throw new InvalidBlockNoteDocumentError(
          `Duplicate block id "${b.id}": block ids must be unique.`,
        );
      }
      id = b.id;
      existing.add(id);
    } else {
      id = generateUniqueBlockId(existing);
    }
    const out: BlockNoteBlock = { ...b, id } as BlockNoteBlock;
    if (out.children && out.children.length > 0) {
      out.children = out.children.map((c) => ensure(c as BlockNoteBlockWithOptionalId));
    }
    return out;
  };
  return blocks.map(ensure);
}

// ── Operations ───────────────────────────────────────────────────────────────
//
// All operations are pure: they deep-clone the input up front and mutate only
// the clone, so the caller's tree is never touched. Each one clones once and
// walks the clone once (via `locateBlock`); `listBlockIds` is only recomputed
// on the error path, to build the "valid block ids" hint.

export function insertBlocks(
  blocks: BlockNoteBlock[],
  position: "start" | "end" | "before" | "after",
  referenceBlockId: string | undefined,
  newBlocks: NewBlockInput[],
): { tree: BlockNoteBlock[]; insertedIds: string[] } {
  const tree = clone(blocks);
  const prepared = regenerateIds(newBlocks, new Set(listBlockIds(tree)));
  const insertedIds = prepared.map((b) => b.id);

  if (position === "start") {
    tree.unshift(...prepared);
    return { tree, insertedIds };
  }
  if (position === "end") {
    tree.push(...prepared);
    return { tree, insertedIds };
  }

  if (!referenceBlockId) {
    throw new BlockNotFoundError("<missing referenceBlockId>", listBlockIds(blocks));
  }
  const slot = locateBlock(tree, referenceBlockId);
  if (!slot) {
    throw new BlockNotFoundError(referenceBlockId, listBlockIds(blocks));
  }
  slot.siblings.splice(position === "before" ? slot.index : slot.index + 1, 0, ...prepared);
  return { tree, insertedIds };
}

export function replaceBlock(
  blocks: BlockNoteBlock[],
  blockId: string,
  newBlock: BlockNoteBlockWithOptionalId,
): BlockNoteBlock[] {
  const tree = clone(blocks);
  const slot = locateBlock(tree, blockId);
  if (!slot) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }

  // Preserve the target root id. For descendants: preserve ids that already
  // belong to the replaced subtree, generate fresh ids for new or missing ones.
  const subtreeIds = listSubtreeIds(slot.siblings[slot.index]);
  const allIds = new Set(listBlockIds(tree));
  slot.siblings[slot.index] = buildReplacement(newBlock, blockId, subtreeIds, allIds);
  return tree;
}

/** Build a replacement block preserving the target id and subtree-descendant ids. */
function buildReplacement(
  input: BlockNoteBlockWithOptionalId,
  targetId: string,
  subtreeIds: Set<string>,
  allIds: Set<string>,
): BlockNoteBlock {
  // `subtreeIds` is consumed as ids are claimed, so the same descendant id
  // supplied twice yields one preserved id and one fresh one instead of a
  // duplicate the storage validation would then reject.
  const build = (b: BlockNoteBlockWithOptionalId, forceId?: string): BlockNoteBlock => {
    let id: string;
    if (forceId) {
      id = forceId;
    } else if (b.id && subtreeIds.delete(b.id)) {
      // Preserve descendant ids that already belong to the replaced subtree.
      id = b.id;
      allIds.add(id);
    } else {
      id = generateUniqueBlockId(allIds);
    }
    const out: BlockNoteBlock = { id, type: b.type };
    if (b.props !== undefined) out.props = b.props;
    if (b.content !== undefined) out.content = b.content;
    if (b.children && b.children.length > 0) {
      out.children = b.children.map((c) => build(c));
    }
    return out;
  };
  return build(input, targetId);
}

export function deleteBlocks(
  blocks: BlockNoteBlock[],
  blockIds: string[],
): { tree: BlockNoteBlock[]; missing: string[] } {
  const allIds = new Set(listBlockIds(blocks));
  const missing = blockIds.filter((id) => !allIds.has(id));
  if (missing.length > 0) {
    return { tree: blocks, missing };
  }
  const tree = clone(blocks);
  removeFromTree(tree, new Set(blockIds));
  return { tree, missing: [] };
}

function removeFromTree(blocks: BlockNoteBlock[], idSet: Set<string>): void {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (idSet.has(blocks[i].id)) {
      blocks.splice(i, 1);
    } else {
      const children = blocks[i].children;
      if (children) removeFromTree(children, idSet);
    }
  }
}

export function updateBlockProps(
  blocks: BlockNoteBlock[],
  blockId: string,
  propsPatch: Record<string, unknown>,
): BlockNoteBlock[] {
  const tree = clone(blocks);
  const slot = locateBlock(tree, blockId);
  if (!slot) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }

  const target = slot.siblings[slot.index];
  const merged: Record<string, unknown> = { ...(target.props ?? {}) };
  for (const [key, val] of Object.entries(propsPatch)) {
    // `null` removes the key, so the agent can reset a prop to its default.
    if (val === null) delete merged[key];
    else merged[key] = val;
  }
  target.props = merged;
  return tree;
}

// ── Native text patch ────────────────────────────────────────────────────────

export function patchBlockText(
  blocks: BlockNoteBlock[],
  blockId: string,
  oldString: string,
  newString: string,
): BlockNoteBlock[] {
  const tree = clone(blocks);
  const slot = locateBlock(tree, blockId);
  if (!slot) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  const target = slot.siblings[slot.index];

  const count = countBlockTextMatches(target.content, oldString);
  if (count === 0) {
    throw new BlockNotePatchError(
      `No match found for old_string within block "${blockId}". The block has no visible text containing that substring.`,
    );
  }
  if (count > 1) {
    throw new BlockNotePatchError(
      `Found ${count} matches for old_string within block "${blockId}". Provide more context to make a unique match.`,
    );
  }

  target.content = applyInlinePatch(target.content, oldString, newString);
  return tree;
}

function countBlockTextMatches(content: unknown, oldString: string): number {
  if (typeof content === "string") {
    return countExactMatches(content, oldString);
  }
  if (Array.isArray(content)) {
    return countFlowMatches(content, oldString);
  }
  if (isPlainObj(content) && (content as Record<string, unknown>).type === "tableContent") {
    const c = content as BlockNoteTableContent;
    if (!Array.isArray(c.rows)) return 0;
    let total = 0;
    for (const row of c.rows) {
      if (!isPlainObj(row)) continue;
      const cells = row.cells;
      if (!Array.isArray(cells)) continue;
      for (const cell of cells) {
        if (isTableCell(cell)) {
          total += countFlowMatches(cell.content, oldString);
        } else if (Array.isArray(cell)) {
          total += countFlowMatches(cell, oldString);
        }
      }
    }
    return total;
  }
  return 0;
}

function applyInlinePatch(content: unknown, oldString: string, newString: string): unknown {
  if (typeof content === "string") {
    return content.replace(oldString, newString);
  }
  if (Array.isArray(content)) {
    return patchFlow(content, oldString, newString);
  }
  if (isPlainObj(content) && (content as Record<string, unknown>).type === "tableContent") {
    const c = content as BlockNoteTableContent;
    const rows = c.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => {
        if (isTableCell(cell)) {
          return { ...cell, content: patchFlow(cell.content, oldString, newString) };
        }
        if (Array.isArray(cell)) {
          return patchFlow(cell, oldString, newString);
        }
        return cell;
      }) as typeof row.cells,
    }));
    return { ...c, rows };
  }
  return content;
}

// ── Flow patch helpers (InlineContent[] operations) ──────────────────────────

type TextLeaf = { text: string; styles?: Record<string, unknown>; isObject: boolean };

function isTextLeaf(node: unknown): node is { type: string; text: unknown; styles?: unknown } {
  return (
    isPlainObj(node) &&
    (node as Record<string, unknown>).type === "text" &&
    typeof (node as Record<string, unknown>).text === "string"
  );
}

function toTextLeaf(node: unknown): TextLeaf | null {
  if (typeof node === "string") return { text: node, isObject: false };
  if (isTextLeaf(node)) {
    return {
      text: node.text as string,
      styles: node.styles as Record<string, unknown> | undefined,
      isObject: true,
    };
  }
  return null;
}

function makeLeaf(text: string, template: TextLeaf): unknown {
  if (text === "") return null;
  if (template.isObject) {
    const leaf: { type: string; text: string; styles?: Record<string, unknown> } = {
      type: "text",
      text,
    };
    if (template.styles) leaf.styles = template.styles;
    return leaf;
  }
  return text;
}

function countFlowMatches(flow: unknown[], oldString: string): number {
  let total = countRunMatches(flow, oldString);
  for (const item of flow) {
    if (isPlainObj(item) && (item as Record<string, unknown>).type === "link") {
      const inner = (item as Record<string, unknown>).content;
      if (Array.isArray(inner)) total += countFlowMatches(inner, oldString);
    }
  }
  return total;
}

function countRunMatches(flow: unknown[], oldString: string): number {
  const runs = splitIntoRuns(flow);
  let total = 0;
  for (const run of runs) {
    const text = run.map((leaf) => leaf.text).join("");
    total += countExactMatches(text, oldString);
  }
  return total;
}

function splitIntoRuns(flow: unknown[]): TextLeaf[][] {
  const runs: TextLeaf[][] = [];
  let current: TextLeaf[] = [];
  for (const item of flow) {
    const leaf = toTextLeaf(item);
    if (leaf) {
      current.push(leaf);
    } else {
      if (current.length > 0) runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function patchFlow(flow: unknown[], oldString: string, newString: string): unknown[] {
  const runMatches = countRunMatches(flow, oldString);
  if (runMatches === 1) {
    return applyToFlow(flow, oldString, newString);
  }

  for (let i = 0; i < flow.length; i++) {
    const item = flow[i];
    if (isPlainObj(item) && (item as Record<string, unknown>).type === "link") {
      const inner = (item as Record<string, unknown>).content;
      if (Array.isArray(inner) && countFlowMatches(inner, oldString) === 1) {
        const patchedLink = {
          ...(item as Record<string, unknown>),
          content: patchFlow(inner, oldString, newString),
        };
        return flow.map((v, idx) => (idx === i ? patchedLink : v));
      }
    }
  }

  return flow;
}

/**
 * Rewrite the run of adjacent text leaves that contains the match. Non-text
 * nodes and runs without the match are re-emitted as-is (the original objects,
 * so any field this module doesn't model survives).
 *
 * Precondition: `countRunMatches(flow, oldString) === 1`, enforced by `patchFlow`.
 */
function applyToFlow(flow: unknown[], oldString: string, newString: string): unknown[] {
  const result: unknown[] = [];
  let i = 0;

  while (i < flow.length) {
    if (!toTextLeaf(flow[i])) {
      result.push(flow[i]);
      i += 1;
      continue;
    }

    // Collect the maximal run of adjacent text leaves starting at `i`.
    const runStart = i;
    const run: TextLeaf[] = [];
    while (i < flow.length) {
      const leaf = toTextLeaf(flow[i]);
      if (!leaf) break;
      run.push(leaf);
      i += 1;
    }

    const matchStart = run.map((l) => l.text).join("").indexOf(oldString);
    if (matchStart === -1) {
      for (let k = runStart; k < i; k++) result.push(flow[k]);
      continue;
    }
    result.push(...spliceRun(run, matchStart, oldString.length, newString));
  }

  return result;
}

/**
 * Replace `[matchStart, matchStart + matchLength)` inside a run of text leaves.
 * Each leaf keeps its own styles for the text it still contributes; the
 * replacement inherits the styles of the leaf the match starts in.
 */
function spliceRun(
  run: TextLeaf[],
  matchStart: number,
  matchLength: number,
  newString: string,
): unknown[] {
  const out: unknown[] = [];
  const matchEnd = matchStart + matchLength;
  let inserted = false;
  let cursor = 0;

  const push = (text: string, template: TextLeaf) => {
    const leaf = makeLeaf(text, template);
    if (leaf !== null) out.push(leaf);
  };

  for (const leaf of run) {
    const start = cursor;
    const end = start + leaf.text.length;
    cursor = end;

    // Head: the part of this leaf sitting before the match.
    if (start < matchStart) {
      push(leaf.text.slice(0, Math.min(end, matchStart) - start), leaf);
    }
    // The replacement lands once, in the leaf where the match begins.
    if (!inserted && start <= matchStart && matchStart < end) {
      push(newString, leaf);
      inserted = true;
    }
    // Tail: the part of this leaf sitting after the match.
    if (end > matchEnd) {
      push(leaf.text.slice(Math.max(start, matchEnd) - start), leaf);
    }
  }

  return out;
}

// ── Full document replacement ────────────────────────────────────────────────

export function normalizeReplaceDocumentBlocks(
  blocks: BlockNoteBlockWithOptionalId[],
): BlockNoteBlock[] {
  const existing = new Set<string>();
  const withIds = ensureIds(blocks, existing);
  validateBlockNoteDocument(withIds);
  return withIds;
}
