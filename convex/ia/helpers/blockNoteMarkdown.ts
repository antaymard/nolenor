// BlockNote XML v1 codec — the canonical agent-boundary format.
//
// `read_nodes` emits BlockNote XML v1 and every content-bearing write tool
// (`set_node_data`, `insert_blocks`, `replace_block`) accepts it verbatim.
// Inline content is plain Markdown (bold, italic, strike, code, links). Block
// props (colors, alignment, level) are carried in the `props` attribute.
// Tables use a structured `<table>` element because Markdown tables lose cell
// props, widths and spans. Underline and inline text/background colors are
// not preserved (Markdown cannot express them).
//
// Internal storage stays the native BlockNote JSON block array.
//
// BlockNote's markdown APIs read `globalThis.document` (ProseMirror DOMParser),
// so we need a real DOM — provided by jsdom. See `_externalDeps.ts` and
// `convex.json` for the package-loading strategy.

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type BlockNoteBlock,
  type BlockNoteBlockWithOptionalId,
  type BlockNoteInlineContent,
  type BlockNoteTableContent,
  type BlockNoteTableCell,
  compactBlockProps,
  BLOCK_NOTE_DEFAULT_CELL_PROPS,
} from "../../lib/blockNoteDocument";

export const BLOCKNOTE_XML_VERSION = "1";

// ── jsdom globals + concurrency lock ───────────────────────────────────────

type DomGlobals = { document: Document; window: Window & typeof globalThis };

let domPromise: Promise<DomGlobals> | null = null;
let editorPromise: Promise<any> | null = null;
let jsdomLock: Promise<void> = Promise.resolve();

function hiddenRequire(name: string): any {
  const g = globalThis as { require?: (m: string) => any };
  if (!g.require) {
    throw new Error(
      `Cannot load ${name}: require() is not available. Ensure this runs in a "use node" action.`,
    );
  }
  return g.require(name);
}

async function hiddenImport(specifier: string): Promise<any> {
  return import(specifier);
}

async function getDom(): Promise<DomGlobals> {
  if (domPromise) return domPromise;
  domPromise = (async () => {
    const { JSDOM } = hiddenRequire("jsdom");
    const jsdom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "http://localhost/",
      pretendToBeVisual: true,
    });
    const w = jsdom.window as unknown as Window & typeof globalThis;
    return { document: w.document, window: w };
  })();
  return domPromise;
}

async function withJsdomLock<T>(fn: (editor: any, dom: DomGlobals) => T | Promise<T>): Promise<T> {
  const prev = jsdomLock;
  let release!: () => void;
  jsdomLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  const g = globalThis as { document?: Document; window?: Window };
  const savedDoc = g.document;
  const savedWin = g.window;
  try {
    const dom = await getDom();
    (globalThis as { document?: Document }).document = dom.document;
    (globalThis as { window?: Window }).window = dom.window;
    const editor = await getEditor();
    return await fn(editor, dom);
  } finally {
    (globalThis as { document?: Document }).document = savedDoc;
    (globalThis as { window?: Window }).window = savedWin;
    release();
  }
}

async function getEditor(): Promise<any> {
  if (editorPromise) return editorPromise;
  editorPromise = (async () => {
    const mod = await hiddenImport("@blocknote/core");
    return mod.BlockNoteEditor.create();
  })();
  return editorPromise;
}

// ── Search-only helper (not used by the XML codec) ──────────────────────────

export async function blocksToMarkdown(blocks: BlockNoteBlock[]): Promise<string> {
  return withJsdomLock(async (editor) => {
    return editor.blocksToMarkdownLossy(blocks) as string;
  });
}

// ── XML escaping ────────────────────────────────────────────────────────────

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

function isTableContent(content: unknown): content is BlockNoteTableContent {
  return (
    content !== null &&
    typeof content === "object" &&
    (content as Record<string, unknown>).type === "tableContent"
  );
}

function isTableCellObj(cell: unknown): cell is BlockNoteTableCell {
  return (
    cell !== null &&
    typeof cell === "object" &&
    (cell as Record<string, unknown>).type === "tableCell"
  );
}

/** Serialize a block's inline content to Markdown (children excluded). */
function blockContentToMarkdown(editor: any, block: BlockNoteBlock): string {
  const synthetic = { ...block, children: [] };
  try {
    return (editor.blocksToMarkdownLossy([synthetic]) as string).trim();
  } catch {
    return "";
  }
}

/** Serialize inline content (InlineContent[]) to Markdown via a synthetic paragraph. */
function inlineContentToMarkdown(editor: any, content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) return "";
  try {
    const synthetic = { id: "tmp", type: "paragraph", content };
    return (editor.blocksToMarkdownLossy([synthetic]) as string).trim();
  } catch {
    return "";
  }
}

function compactCellProps(props: BlockNoteTableCell["props"]): Record<string, unknown> | null {
  if (!props) return null;
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const val = (props as Record<string, unknown>)[key];
    const def = (BLOCK_NOTE_DEFAULT_CELL_PROPS as Record<string, unknown>)[key];
    if (def !== undefined && val === def) continue;
    filtered[key] = val;
  }
  return Object.keys(filtered).length === 0 ? null : filtered;
}

// ── Serializer: blocks → XML ─────────────────────────────────────────────────
//
// Format:
//   <blocknote version="1">
//     <block id="…" type="…" props='{"level":2}'>
//       Markdown content goes directly here as text.
//       <children>
//         <block …>child</block>
//       </children>
//     </block>
//     <block id="…" type="table">
//       <table headerRows="1">…</table>
//     </block>
//     <block id="…" type="image" props='{"url":"…"}'/>
//   </blocknote>

export async function blockNoteDocumentToXml(
  blocks: BlockNoteBlock[],
): Promise<string> {
  if (!blocks || blocks.length === 0) {
    return `<blocknote version="${BLOCKNOTE_XML_VERSION}"/>`;
  }
  return withJsdomLock(async (editor) => {
    const parts = blocks.map((b) => blockToXml(editor, b, 0));
    return `<blocknote version="${BLOCKNOTE_XML_VERSION}">\n${parts.join("\n")}\n</blocknote>`;
  });
}

function blockToXml(editor: any, block: BlockNoteBlock, indent: number): string {
  const pad = "  ".repeat(indent);
  const id = typeof block.id === "string" ? block.id : "";
  const type = typeof block.type === "string" ? block.type : "";
  const props = compactBlockProps(type, block.props);
  const propsAttr = props
    ? ` props="${escapeXmlAttr(JSON.stringify(sortKeys(props)))}"`
    : "";

  const openTag = `${pad}<block id="${escapeXmlAttr(id)}" type="${escapeXmlAttr(type)}"${propsAttr}`;

  const children = Array.isArray(block.children) ? block.children : [];
  const content = block.content;
  const hasTable = isTableContent(content);
  const hasInline = content !== undefined && content !== null && !hasTable;
  const hasChildren = children.length > 0;

  if (!hasTable && !hasInline && !hasChildren) {
    return `${openTag}/>`;
  }

  const parts: string[] = [`${openTag}>`];

  if (hasInline) {
    const md = blockContentToMarkdown(editor, block);
    if (md) {
      parts.push(`${pad}  ${escapeXmlText(md)}`);
    }
  }

  if (hasTable) {
    parts.push(tableToXml(editor, content, indent + 1));
  }

  if (hasChildren) {
    parts.push(`${pad}  <children>`);
    for (const child of children) {
      parts.push(blockToXml(editor, child, indent + 2));
    }
    parts.push(`${pad}  </children>`);
  }

  parts.push(`${pad}</block>`);
  return parts.join("\n");
}

function tableToXml(editor: any, content: BlockNoteTableContent, indent: number): string {
  const pad = "  ".repeat(indent);

  let openTag = `${pad}<table`;
  if (content.headerRows !== undefined) openTag += ` headerRows="${content.headerRows}"`;
  if (content.headerCols !== undefined) openTag += ` headerCols="${content.headerCols}"`;
  openTag += ">";

  const cols: string[] = [`${pad}  <columns>`];
  const widths = content.columnWidths ?? [];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    if (w !== undefined && w !== null) {
      cols.push(`${pad}    <column width="${w}"/>`);
    } else {
      cols.push(`${pad}    <column/>`);
    }
  }
  cols.push(`${pad}  </columns>`);

  const rowParts: string[] = [];
  for (const row of content.rows) {
    rowParts.push(`${pad}  <row>`);
    for (const cell of row.cells) {
      if (isTableCellObj(cell)) {
        const cellProps = compactCellProps(cell.props);
        const cellPropsAttr = cellProps
          ? ` props="${escapeXmlAttr(JSON.stringify(sortKeys(cellProps as Record<string, unknown>)))}"`
          : "";
        const cellMd = inlineContentToMarkdown(editor, cell.content);
        if (cellMd) {
          rowParts.push(`${pad}    <cell${cellPropsAttr}>${escapeXmlText(cellMd)}</cell>`);
        } else {
          rowParts.push(`${pad}    <cell${cellPropsAttr}/>`);
        }
      } else if (Array.isArray(cell)) {
        // Legacy array cell
        const cellMd = inlineContentToMarkdown(editor, cell);
        if (cellMd) {
          rowParts.push(`${pad}    <cell>${escapeXmlText(cellMd)}</cell>`);
        } else {
          rowParts.push(`${pad}    <cell/>`);
        }
      }
    }
    rowParts.push(`${pad}  </row>`);
  }

  return [openTag, ...cols, ...rowParts, `${pad}</table>`].join("\n");
}

// ── Parser: XML → blocks ──────────────────────────────────────────────────────
//
// Uses DOMParser with application/xml (never HTML). Strict: rejects unknown
// elements, comments, malformed props JSON. No regex, no format detection.
//
// Parsing logic per <block>:
//   - <table> child element → table content
//   - <children> child element → nested blocks
//   - text nodes (concatenated, trimmed) → inline Markdown, parsed via editor

export async function parseBlockNoteXml(
  xml: string,
): Promise<BlockNoteBlockWithOptionalId[]> {
  return withJsdomLock(async (editor, dom) => {
    const parser = new dom.window.DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const errors = doc.getElementsByTagName("parsererror");
    if (errors.length > 0) {
      throw new Error(
        `Invalid BlockNote XML: ${errors[0].textContent?.slice(0, 200) ?? "parse error"}`,
      );
    }

    const root = doc.documentElement;
    if (!root || root.tagName !== "blocknote") {
      throw new Error(
        `Invalid BlockNote XML: root element must be <blocknote>, got <${root?.tagName ?? "none"}>.`,
      );
    }

    const version = root.getAttribute("version");
    if (version !== BLOCKNOTE_XML_VERSION) {
      throw new Error(
        `Invalid BlockNote XML: expected version="${BLOCKNOTE_XML_VERSION}", got version="${version ?? "none"}".`,
      );
    }

    const blocks: BlockNoteBlockWithOptionalId[] = [];
    for (const child of Array.from(root.children)) {
      if (child.tagName !== "block") {
        throw new Error(
          `Invalid BlockNote XML: unexpected element <${child.tagName}> inside <blocknote>.`,
        );
      }
      blocks.push(parseBlockElement(editor, child));
    }

    return blocks;
  });
}

function parseBlockElement(editor: any, el: Element): BlockNoteBlockWithOptionalId {
  const id = el.getAttribute("id") ?? undefined;
  const type = el.getAttribute("type");
  if (!type) {
    throw new Error(`Invalid BlockNote XML: <block> is missing a "type" attribute.`);
  }

  const propsStr = el.getAttribute("props");
  let props: Record<string, unknown> | undefined;
  if (propsStr) {
    try {
      props = JSON.parse(propsStr) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Invalid BlockNote XML: <block type="${type}"> has invalid props JSON: ${propsStr.slice(0, 100)}`,
      );
    }
    if (!props || typeof props !== "object" || Array.isArray(props)) {
      throw new Error(`Invalid BlockNote XML: props must be a JSON object.`);
    }
  }

  let tableContent: unknown;
  let markdownText = "";
  const children: BlockNoteBlockWithOptionalId[] = [];

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 /* TEXT */) {
      markdownText += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== 1 /* ELEMENT */) continue;

    const elem = child as Element;
    switch (elem.tagName) {
      case "table":
        if (tableContent !== undefined) {
          throw new Error(`Invalid BlockNote XML: <block type="${type}"> has multiple <table> elements.`);
        }
        tableContent = parseTableElement(editor, elem);
        break;
      case "children":
        for (const grandChild of Array.from(elem.children)) {
          if (grandChild.tagName !== "block") {
            throw new Error(`Invalid BlockNote XML: unexpected <${grandChild.tagName}> inside <children>.`);
          }
          children.push(parseBlockElement(editor, grandChild));
        }
        break;
      default:
        throw new Error(`Invalid BlockNote XML: unexpected <${elem.tagName}> inside <block>.`);
    }
  }

  // Parse the accumulated text as Markdown to produce inline content.
  const trimmedMd = markdownText.trim();
  let content: unknown;
  if (tableContent !== undefined) {
    content = tableContent;
  } else if (trimmedMd) {
    content = parseMarkdownToInline(editor, trimmedMd);
  }

  const block: BlockNoteBlockWithOptionalId = { type };
  if (id) block.id = id;
  if (props) block.props = props;
  if (content !== undefined) block.content = content;
  if (children.length > 0) block.children = children;
  return block;
}

/**
 * Parse a Markdown string into inline content (InlineContent[]).
 * The Markdown must produce exactly one paragraph block; its content is extracted.
 */
function parseMarkdownToInline(editor: any, md: string): unknown[] {
  const blocks = editor.tryParseMarkdownToBlocks(md);
  if (!blocks || blocks.length === 0) return [];
  if (blocks.length > 1) {
    throw new Error(
      `Invalid BlockNote XML: block content produced ${blocks.length} blocks. Use separate <block> elements for multiple blocks.`,
    );
  }
  return (blocks[0].content ?? []) as unknown[];
}

function parseTableElement(editor: any, el: Element): BlockNoteTableContent {
  const headerRows = el.getAttribute("headerRows");
  const headerCols = el.getAttribute("headerCols");

  let columnWidths: (number | undefined)[] = [];
  const rows: Array<{ cells: BlockNoteTableCell[] | BlockNoteInlineContent[][] }> = [];

  for (const child of Array.from(el.children)) {
    if (child.tagName === "columns") {
      const cols: (number | undefined)[] = [];
      for (const col of Array.from(child.children)) {
        if (col.tagName !== "column") {
          throw new Error(`Invalid BlockNote XML: unexpected <${col.tagName}> inside <columns>.`);
        }
        const widthAttr = col.getAttribute("width");
        cols.push(widthAttr !== null ? Number(widthAttr) : undefined);
      }
      columnWidths = cols;
    } else if (child.tagName === "row") {
      const cells: BlockNoteTableCell[] = [];
      for (const cell of Array.from(child.children)) {
        if (cell.tagName !== "cell") {
          throw new Error(`Invalid BlockNote XML: unexpected <${cell.tagName}> inside <row>.`);
        }
        const propsStr = cell.getAttribute("props");
        let cellProps: Record<string, unknown> = {};
        if (propsStr) {
          try {
            cellProps = JSON.parse(propsStr) as Record<string, unknown>;
          } catch {
            throw new Error(`Invalid BlockNote XML: invalid cell props JSON: ${propsStr.slice(0, 100)}`);
          }
        }
        const cellMd = (cell.textContent ?? "").trim();
        const cellContent = cellMd ? parseMarkdownToInline(editor, cellMd) : [];
        cells.push({
          type: "tableCell",
          props: { ...BLOCK_NOTE_DEFAULT_CELL_PROPS, ...cellProps } as BlockNoteTableCell["props"],
          content: cellContent as BlockNoteInlineContent[],
        });
      }
      rows.push({ cells });
    } else {
      throw new Error(`Invalid BlockNote XML: unexpected <${child.tagName}> inside <table>.`);
    }
  }

  const result: BlockNoteTableContent = {
    type: "tableContent",
    columnWidths,
    rows,
  };
  if (headerRows !== null) result.headerRows = Number(headerRows);
  if (headerCols !== null) result.headerCols = Number(headerCols);
  return result;
}
