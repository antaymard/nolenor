import { parseStoredPlateDocument } from "./plateDocumentStorage";

export class InvalidBlockNoteDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBlockNoteDocumentError";
  }
}

function describePath(path: ReadonlyArray<(number | string)[]>): string {
  return path.length === 0 ? "root" : path.map((p) => `[${p.join("][")}]`).join("");
}

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateInlineContent(content: unknown, path: ReadonlyArray<(number | string)[]>): void {
  if (typeof content === "string") return;
  if (!Array.isArray(content)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid content at ${describePath(path)}: expected array, string, or undefined, got ${content === null ? "null" : typeof content}.`,
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

function validateBlock(block: unknown, path: ReadonlyArray<(number | string)[]>): void {
  if (!isPlainObj(block)) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid block at ${describePath(path)}: expected object, got ${block === null ? "null" : typeof block}.`,
    );
  }
  const b = block as Record<string, unknown>;
  if (typeof b.id !== "string" || b.id.length === 0) {
    throw new InvalidBlockNoteDocumentError(
      `Invalid block at ${describePath(path)}: missing or empty "id" string.`,
    );
  }
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
    validateInlineContent(b.content, [...path, ["content"]]);
  }
  if (b.children !== undefined) {
    if (!Array.isArray(b.children)) {
      throw new InvalidBlockNoteDocumentError(
        `Invalid block at ${describePath(path)} (id="${b.id}"): "children" must be an array.`,
      );
    }
    for (let i = 0; i < b.children.length; i++) {
      validateBlock(b.children[i], [...path, ["children", i]]);
    }
  }
}

export function validateBlockNoteDocument(doc: unknown): void {
  if (!Array.isArray(doc)) {
    throw new InvalidBlockNoteDocumentError(
      `BlockNote document must be an array, got ${doc === null ? "null" : typeof doc}.`,
    );
  }
  for (let i = 0; i < doc.length; i++) {
    validateBlock(doc[i], [[String(i)]]);
  }
}

export function stringifyBlockNoteDocumentForStorage(doc: unknown): string {
  validateBlockNoteDocument(doc);
  return JSON.stringify(doc);
}

export { parseStoredPlateDocument };
