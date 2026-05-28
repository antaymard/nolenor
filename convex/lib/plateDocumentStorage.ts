export function parseStoredPlateDocument(doc: unknown): Array<unknown> | null {
  if (Array.isArray(doc)) {
    return doc;
  }

  if (typeof doc === "string") {
    try {
      const parsed = JSON.parse(doc);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

export class InvalidPlateDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlateDocumentError";
  }
}

function isPlateTextNode(node: unknown): boolean {
  return (
    node !== null &&
    typeof node === "object" &&
    typeof (node as { text?: unknown }).text === "string"
  );
}

function describePath(path: ReadonlyArray<number>): string {
  return path.length === 0 ? "root" : `root[${path.join("][")}]`;
}

function validateDescendant(
  node: unknown,
  path: ReadonlyArray<number>,
): void {
  if (node === null || typeof node !== "object") {
    throw new InvalidPlateDocumentError(
      `Invalid node at ${describePath(path)}: expected object, got ${node === null ? "null" : typeof node}.`,
    );
  }

  if (isPlateTextNode(node)) {
    return;
  }

  const element = node as { type?: unknown; children?: unknown };

  if (typeof element.type !== "string" || element.type.length === 0) {
    throw new InvalidPlateDocumentError(
      `Invalid element at ${describePath(path)}: missing or empty "type" string.`,
    );
  }

  if (!Array.isArray(element.children)) {
    throw new InvalidPlateDocumentError(
      `Invalid element at ${describePath(path)} (type="${element.type}"): "children" must be an array.`,
    );
  }

  if (element.children.length === 0) {
    throw new InvalidPlateDocumentError(
      `Invalid element at ${describePath(path)} (type="${element.type}"): "children" must contain at least one descendant.`,
    );
  }

  for (let i = 0; i < element.children.length; i++) {
    validateDescendant(element.children[i], [...path, i]);
  }
}

export function validatePlateDocument(doc: unknown): void {
  if (!Array.isArray(doc)) {
    throw new InvalidPlateDocumentError(
      `PlateJS document must be an array, got ${doc === null ? "null" : typeof doc}.`,
    );
  }

  for (let i = 0; i < doc.length; i++) {
    validateDescendant(doc[i], [i]);
  }
}

export function stringifyPlateDocumentForStorage(doc: unknown): string {
  validatePlateDocument(doc);
  return JSON.stringify(doc);
}
