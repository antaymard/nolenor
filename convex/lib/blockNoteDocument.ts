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
// These match BlockNote 0.51.3 default block specs. The codec uses them to
// omit default props from XML attributes for readability.

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

function describePath(path: ReadonlyArray<(number | string)[]>): string {
  return path.length === 0 ? "root" : path.map((p) => `[${p.join("][")}]`).join("");
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

function validateInlineContent(
  content: unknown,
  path: ReadonlyArray<(number | string)[]>,
): void {
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
    const p = [...path, ["content", i]];
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
    if (n.content !== undefined) {
      validateInlineContent(n.content, [...p, ["content"]]);
    }
  }
}

function isTableCell(cell: unknown): cell is BlockNoteTableCell {
  return isPlainObj(cell) && (cell as Record<string, unknown>).type === "tableCell";
}

function isLegacyCellArray(cell: unknown): cell is BlockNoteInlineContent[] {
  return Array.isArray(cell);
}

function validateTableContent(
  content: unknown,
  path: ReadonlyArray<(number | string)[]>,
): void {
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
  for (let r = 0; r < c.rows.length; r++) {
    const row = c.rows[r];
    const rp = [...path, ["rows", r]];
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
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      const cp = [...rp, ["cells", ci]];
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
        validateInlineContent(cell.content, [...cp, ["content"]]);
      } else if (isLegacyCellArray(cell)) {
        // Legacy array-of-inline-content cell
        validateInlineContent(cell, cp);
      } else {
        throw new InvalidBlockNoteDocumentError(
          `Invalid table cell at ${describePath(cp)}: expected a tableCell object or an inline content array.`,
        );
      }
    }
  }
}

function validateContent(
  content: unknown,
  path: ReadonlyArray<(number | string)[]>,
): void {
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

function collectBlockIds(
  block: unknown,
  path: ReadonlyArray<(number | string)[]>,
  seen: Set<string>,
): void {
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
    validateContent(b.content, [...path, ["content"]]);
  }
  if (b.children !== undefined) {
    if (!Array.isArray(b.children)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid block at ${describePath(path)} (id="${b.id}"): "children" must be an array.`,
      );
    }
    for (let i = 0; i < b.children.length; i++) {
      collectBlockIds(b.children[i], [...path, ["children", i]], seen);
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
    collectBlockIds(doc[i], [[String(i)]], seen);
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
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBlock(b.children, id);
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

export function extractInlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (typeof node === "string") return node;
      if (isPlainObj(node)) {
        const n = node as Record<string, unknown>;
        if (typeof n.text === "string") return n.text;
        if (n.content !== undefined) return extractInlineText(n.content);
      }
      return "";
    })
    .join("");
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

// ── Operations (pure: clone input, return a new tree) ────────────────────────

export function insertBlocks(
  blocks: BlockNoteBlock[],
  position: "start" | "end" | "before" | "after",
  referenceBlockId: string | undefined,
  newBlocks: NewBlockInput[],
): { tree: BlockNoteBlock[]; insertedIds: string[] } {
  const tree = clone(blocks);
  const existingIds = new Set(listBlockIds(blocks));
  const prepared = regenerateIds(newBlocks, existingIds);

  if (position === "start") {
    return { tree: [...prepared, ...tree], insertedIds: prepared.map((b) => b.id) };
  }
  if (position === "end") {
    return { tree: [...tree, ...prepared], insertedIds: prepared.map((b) => b.id) };
  }

  if (!referenceBlockId) {
    throw new BlockNotFoundError("<missing referenceBlockId>", listBlockIds(blocks));
  }
  if (!insertInTree(tree, referenceBlockId, position, prepared)) {
    throw new BlockNotFoundError(referenceBlockId, listBlockIds(blocks));
  }
  return { tree, insertedIds: prepared.map((b) => b.id) };
}

function insertInTree(
  blocks: BlockNoteBlock[],
  refId: string,
  position: "before" | "after",
  newBlocks: BlockNoteBlock[],
): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === refId) {
      const at = position === "before" ? i : i + 1;
      blocks.splice(at, 0, ...newBlocks);
      return true;
    }
    const children = blocks[i].children;
    if (children && insertInTree(children, refId, position, newBlocks)) {
      return true;
    }
  }
  return false;
}

export function replaceBlock(
  blocks: BlockNoteBlock[],
  blockId: string,
  newBlock: BlockNoteBlockWithOptionalId,
): BlockNoteBlock[] {
  const tree = clone(blocks);
  const target = findBlock(blocks, blockId);
  if (!target) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }

  // Preserve the target root id. For descendants: preserve ids that already
  // belong to the replaced subtree, generate fresh ids for new or missing ones.
  const subtreeIds = listSubtreeIds(target);
  const allIds = new Set(listBlockIds(blocks));
  const replacement = buildReplacement(newBlock, blockId, subtreeIds, allIds);

  if (!replaceInTree(tree, blockId, replacement)) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  return tree;
}

/** Build a replacement block preserving the target id and subtree-descendant ids. */
function buildReplacement(
  input: BlockNoteBlockWithOptionalId,
  targetId: string,
  subtreeIds: Set<string>,
  allIds: Set<string>,
): BlockNoteBlock {
  const build = (b: BlockNoteBlockWithOptionalId, forceId?: string): BlockNoteBlock => {
    let id: string;
    if (forceId) {
      id = forceId;
    } else if (b.id && subtreeIds.has(b.id)) {
      // Preserve descendant ids that already belong to the replaced subtree.
      id = b.id;
      if (allIds.has(id) && !subtreeIds.has(id)) {
        throw new InvalidBlockNoteDocumentError(
          `Block id "${id}" already exists outside the replaced subtree.`,
        );
      }
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

function replaceInTree(
  blocks: BlockNoteBlock[],
  blockId: string,
  newBlock: BlockNoteBlock,
): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === blockId) {
      blocks[i] = newBlock;
      return true;
    }
    const children = blocks[i].children;
    if (children && replaceInTree(children, blockId, newBlock)) {
      return true;
    }
  }
  return false;
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
  if (!updatePropsInTree(tree, blockId, propsPatch)) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  return tree;
}

function updatePropsInTree(
  blocks: BlockNoteBlock[],
  blockId: string,
  patch: Record<string, unknown>,
): boolean {
  for (const b of blocks) {
    if (b.id === blockId) {
      const merged: Record<string, unknown> = { ...(b.props ?? {}) };
      for (const [key, val] of Object.entries(patch)) {
        if (val === null) {
          delete merged[key];
        } else {
          merged[key] = val;
        }
      }
      b.props = merged;
      return true;
    }
    if (b.children && updatePropsInTree(b.children, blockId, patch)) {
      return true;
    }
  }
  return false;
}

// ── Native text patch ────────────────────────────────────────────────────────

export function patchBlockText(
  blocks: BlockNoteBlock[],
  blockId: string,
  oldString: string,
  newString: string,
): BlockNoteBlock[] {
  const target = findBlock(blocks, blockId);
  if (!target) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }

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

  const tree = clone(blocks);
  const updated = findBlock(tree, blockId);
  if (!updated) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  updated.content = applyInlinePatch(updated.content, oldString, newString);
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

function applyToFlow(flow: unknown[], oldString: string, newString: string): unknown[] {
  const result: unknown[] = [];
  let i = 0;
  while (i < flow.length) {
    const leaf = toTextLeaf(flow[i]);
    if (!leaf) {
      result.push(flow[i]);
      i++;
      continue;
    }

    const runLeaves: TextLeaf[] = [];
    while (i < flow.length) {
      const l = toTextLeaf(flow[i]);
      if (!l) break;
      runLeaves.push(l);
      i++;
    }

    const text = runLeaves.map((l) => l.text).join("");
    const matchStart = text.indexOf(oldString);
    if (matchStart === -1) {
      for (const l of runLeaves) result.push(makeLeaf(l.text, l) ?? l);
      continue;
    }

    const matchEnd = matchStart + oldString.length;
    let cursor = 0;
    let leafA = 0;
    while (cursor + runLeaves[leafA].text.length <= matchStart) {
      cursor += runLeaves[leafA].text.length;
      leafA++;
    }
    const offsetA = matchStart - cursor;

    let leafB = leafA;
    let cursorB = cursor;
    while (cursorB + runLeaves[leafB].text.length < matchEnd) {
      cursorB += runLeaves[leafB].text.length;
      leafB++;
    }
    const offsetB = matchEnd - cursorB;

    const template = runLeaves[leafA];
    const prefix = runLeaves[leafA].text.slice(0, offsetA);
    const suffix = runLeaves[leafB].text.slice(offsetB);

    if (prefix) result.push(makeLeaf(prefix, template));
    if (newString) result.push(makeLeaf(newString, template));
    if (suffix) result.push(makeLeaf(suffix, runLeaves[leafB]));
    for (let k = leafB + 1; k < runLeaves.length; k++) {
      result.push(makeLeaf(runLeaves[k].text, runLeaves[k]) ?? runLeaves[k]);
    }
    while (i < flow.length) {
      result.push(flow[i]);
      i++;
    }
    return result;
  }
  return result;
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

// ── Shared small utility ─────────────────────────────────────────────────────

function countExactMatches(source: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = source.indexOf(search, index);
    if (found === -1) break;
    count += 1;
    index = found + search.length;
  }
  return count;
}
