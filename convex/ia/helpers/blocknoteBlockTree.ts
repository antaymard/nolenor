/* eslint-disable @typescript-eslint/no-explicit-any */
// Pure structural operations on BlockNote Block[] trees.
//
// No DOM / jsdom dependency: these are plain array transformations that keep
// untouched blocks byte-identical (a deep clone is taken so the original
// stored array is never mutated in place). Block IDs are generated with Web
// Crypto so the helper runs in any Convex runtime (V8 isolate or Node).

export type AnyBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: any;
  children?: AnyBlock[];
};

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const ID_LENGTH = 21;

function randomBytes(n: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    const arr = new Uint8Array(n);
    c.getRandomValues(arr);
    return arr;
  }
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

/** Generate a nanoid-compatible block ID (URL-safe, 21 chars). */
export function generateBlockId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Recursively collect every block id reachable from the tree. */
export function listBlockIds(blocks: AnyBlock[]): string[] {
  const ids: string[] = [];
  const walk = (bs: AnyBlock[]) => {
    for (const b of bs) {
      ids.push(b.id);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return ids;
}

/** Recursively find a block by id. Returns the block object (within the passed tree) or null. */
export function findBlock(blocks: AnyBlock[], id: string): AnyBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBlock(b.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** Ensure every block in the list (and its descendants) has an `id`. */
export function ensureBlockIds(blocks: AnyBlock[]): AnyBlock[] {
  const ensure = (b: AnyBlock): AnyBlock => {
    const out: AnyBlock = b.id ? { ...b } : { ...b, id: generateBlockId() };
    if (out.children && out.children.length > 0) {
      out.children = out.children.map(ensure);
    }
    return out;
  };
  return blocks.map(ensure);
}

// ── Replace ────────────────────────────────────────────────────────────────
function replaceInTree(
  blocks: AnyBlock[],
  blockId: string,
  newBlock: AnyBlock,
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

export function replaceBlock(
  blocks: AnyBlock[],
  blockId: string,
  newBlock: AnyBlock,
): AnyBlock[] {
  const tree = clone(blocks);
  if (!replaceInTree(tree, blockId, newBlock)) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  return tree;
}

// ── Insert ──────────────────────────────────────────────────────────────────
function insertInTree(
  blocks: AnyBlock[],
  refId: string,
  position: "before" | "after",
  newBlocks: AnyBlock[],
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

export function insertBlocks(
  blocks: AnyBlock[],
  reference: string | "START" | "END",
  position: "before" | "after",
  newBlocks: AnyBlock[],
): AnyBlock[] {
  const tree = clone(blocks);
  const prepared = ensureBlockIds(newBlocks);
  if (reference === "START" || reference === "END") {
    if (reference === "START") {
      return [...prepared, ...tree];
    }
    return [...tree, ...prepared];
  }
  if (!insertInTree(tree, reference, position, prepared)) {
    throw new BlockNotFoundError(reference, listBlockIds(blocks));
  }
  return tree;
}

// ── Delete ──────────────────────────────────────────────────────────────────
function removeFromTree(blocks: AnyBlock[], idSet: Set<string>): void {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (idSet.has(blocks[i].id)) {
      blocks.splice(i, 1);
    } else {
      const children = blocks[i].children;
      if (children) removeFromTree(children, idSet);
    }
  }
}

export function deleteBlocks(
  blocks: AnyBlock[],
  blockIds: string[],
): { tree: AnyBlock[]; missing: string[] } {
  const idSet = new Set(blockIds);
  const allIds = new Set(listBlockIds(blocks));
  const missing = blockIds.filter((id) => !allIds.has(id));
  const tree = clone(blocks);
  removeFromTree(tree, idSet);
  return { tree, missing };
}

// ── Update props (partial merge) ─────────────────────────────────────────────
function updatePropsInTree(
  blocks: AnyBlock[],
  blockId: string,
  patch: Record<string, unknown>,
): boolean {
  for (const b of blocks) {
    if (b.id === blockId) {
      b.props = { ...(b.props ?? {}), ...patch };
      return true;
    }
    if (b.children && updatePropsInTree(b.children, blockId, patch)) {
      return true;
    }
  }
  return false;
}

export function updateBlockProps(
  blocks: AnyBlock[],
  blockId: string,
  propsPatch: Record<string, unknown>,
): AnyBlock[] {
  const tree = clone(blocks);
  if (!updatePropsInTree(tree, blockId, propsPatch)) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  return tree;
}

// ── Update content (used by patch_block_text after re-conversion) ────────────
function updateContentInTree(
  blocks: AnyBlock[],
  blockId: string,
  newContent: unknown,
): boolean {
  for (const b of blocks) {
    if (b.id === blockId) {
      b.content = newContent;
      return true;
    }
    if (b.children && updateContentInTree(b.children, blockId, newContent)) {
      return true;
    }
  }
  return false;
}

export function updateBlockContent(
  blocks: AnyBlock[],
  blockId: string,
  newContent: unknown,
): AnyBlock[] {
  const tree = clone(blocks);
  if (!updateContentInTree(tree, blockId, newContent)) {
    throw new BlockNotFoundError(blockId, listBlockIds(blocks));
  }
  return tree;
}

// ── Errors ──────────────────────────────────────────────────────────────────
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
