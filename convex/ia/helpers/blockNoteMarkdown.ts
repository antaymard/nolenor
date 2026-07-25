// BlockNote XML v1 codec + Markdown → blocks converter.
//
// Two surfaces for the agent:
//  • `read_nodes` emits BlockNote XML v1 (lossless structural read: ids,
//    types, props, structured tables). `insert_blocks` / `replace_block`
//    accept that same XML back for precise block-level edits.
//  • `set_node_data` (full document replace) accepts plain Markdown via
//    `markdownToBlockNoteBlocks` — simpler for authoring, intentionally lossy
//    (no colors, alignment, or advanced table props survive the Markdown
//    round-trip). Block ids are regenerated, so the agent must re-read before
//    any subsequent targeted edit.
//
// Inline content inside the XML is plain Markdown (bold, italic, strike, code,
// links). Block props (colors, alignment, level) are carried in the `props`
// attribute. Tables use a structured `<table>` element because Markdown tables
// lose cell props, widths and spans. Underline and inline text/background
// colors are not preserved (Markdown cannot express them).
//
// Internal storage stays the native BlockNote JSON block array.
//
// The codec itself is pure: every function that needs a BlockNote editor takes
// one as a parameter. The jsdom bootstrap and the global-swap lock live in
// `headlessBlockNote.ts`; only the four exported entry points below acquire it.

import {
  type BlockNoteBlock,
  type BlockNoteBlockWithOptionalId,
  type BlockNoteInlineContent,
  type BlockNoteTableContent,
  type BlockNoteTableCell,
  compactBlockProps,
  BLOCK_NOTE_DEFAULT_CELL_PROPS,
} from "../../lib/blockNoteDocument";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";
import {
  withHeadlessEditor,
  type HeadlessBlockNoteEditor,
} from "./headlessBlockNote";

export const BLOCKNOTE_XML_VERSION = "1";

// ── Frontend-only custom types ──────────────────────────────────────────────
//
// `date` (inline) and `callout` (block) are declared by the frontend schema
// (src/components/blocknote/). The headless editor runs the DEFAULT schema and
// throws "node type X not found in schema" on them, so both are rewritten
// before anything is handed to it.
//
//  • date pills → plain text "📅 <date>". Lossy on the write path: if the agent
//    rewrites that block the pill comes back as text. Keeps search indexing
//    working and lets the agent see the value. The stored JSON keeps the pill.
//  • callouts → paragraphs. Lossless for the agent: icon/color live in props,
//    which the XML carries independently of the headless editor.

function datePillsToText(content: unknown): unknown {
  if (typeof content === "string" || content === undefined || content === null) {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((node) => {
      if (typeof node !== "object" || node === null) return node;
      const n = node as Record<string, unknown>;
      if (n.type === "date") {
        const props = n.props as Record<string, unknown> | undefined;
        const date = typeof props?.date === "string" ? props.date : "";
        return { type: "text", text: date ? `📅 ${date}` : "📅" };
      }
      if (n.content !== undefined) {
        return { ...n, content: datePillsToText(n.content) };
      }
      return node;
    });
  }
  if (isTableContent(content)) {
    return {
      ...content,
      rows: content.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) =>
          isTableCellObj(cell)
            ? {
                ...cell,
                content: datePillsToText(cell.content) as BlockNoteInlineContent[],
              }
            : datePillsToText(cell),
        ),
      })),
    };
  }
  return content;
}

/**
 * Rewrite one block's own type/props/content for the default-schema headless
 * editor. Children are NOT touched — callers that need a whole subtree use
 * `sanitizeBlockForHeadless`, callers that serialize a single block's inline
 * content use this and drop the children entirely.
 */
function sanitizeBlockShallow(block: BlockNoteBlock): BlockNoteBlock {
  const out = { ...block };
  if (out.type === "callout") {
    // Paragraph (not quote) so the serialized content stays raw text — no
    // `> ` prefix in the search index or in the XML the agent reads.
    out.type = "paragraph";
    // The paragraph schema doesn't know callout props (color/icon): the HTML
    // exporter iterates block props against the propSchema and would throw
    // `Cannot read properties of undefined (reading 'default')`.
    delete out.props;
  }
  if (out.content !== undefined) out.content = datePillsToText(out.content);
  return out;
}

/** Recursively rewrite frontend-only custom types for the headless editor. */
function sanitizeBlockForHeadless(block: BlockNoteBlock): BlockNoteBlock {
  const out = sanitizeBlockShallow(block);
  if (Array.isArray(out.children)) {
    out.children = out.children.map(sanitizeBlockForHeadless);
  }
  return out;
}

// ── Search-only helper (not used by the XML codec) ──────────────────────────

export async function blocksToMarkdown(blocks: BlockNoteBlock[]): Promise<string> {
  return withHeadlessEditor((editor) =>
    editor.blocksToMarkdownLossy(blocks.map(sanitizeBlockForHeadless)),
  );
}

// ── Markdown → blocks (used by set_node_data full replace) ──────────────────
//
// Plain Markdown in, native BlockNote block array out. Intentionally lossy:
// block-level props (colors, alignment, etc.) and advanced table props are
// not expressible in Markdown and will be reset to defaults. Block ids are
// regenerated by the server-side `normalizeReplaceDocumentBlocks` step, so the
// agent must re-read the document before any block-id-addressed edit.
//
// An empty / whitespace-only Markdown string produces an empty document `[]`,
// matching the ephemeral-paragraph behaviour of the editor frontend.

export async function markdownToBlockNoteBlocks(
  markdown: string,
): Promise<BlockNoteBlockWithOptionalId[]> {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }
  return withHeadlessEditor(
    (editor) =>
      (editor.tryParseMarkdownToBlocks(markdown) ??
        []) as BlockNoteBlockWithOptionalId[],
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/** Serialize props as a sorted-key JSON `props="…"` attribute, or "" when empty. */
function propsAttribute(props: Record<string, unknown> | null): string {
  if (!props) return "";
  return ` props="${escapeXmlAttribute(JSON.stringify(sortKeys(props)))}"`;
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

/** Serialize a block's own inline content to Markdown (children excluded). */
function blockContentToMarkdown(
  editor: HeadlessBlockNoteEditor,
  block: BlockNoteBlock,
): string {
  // `children` is dropped BEFORE sanitizing: sanitizing first would deep-copy
  // the whole subtree only to throw it away, making serialization quadratic on
  // nested documents (this runs once per block).
  const synthetic = sanitizeBlockShallow({ ...block, children: [] });
  try {
    return editor.blocksToMarkdownLossy([synthetic]).trim();
  } catch {
    return "";
  }
}

/** Serialize inline content (InlineContent[]) to Markdown via a synthetic paragraph. */
function inlineContentToMarkdown(
  editor: HeadlessBlockNoteEditor,
  content: unknown,
): string {
  if (!Array.isArray(content) || content.length === 0) return "";
  try {
    return editor
      .blocksToMarkdownLossy([
        { id: "tmp", type: "paragraph", content: datePillsToText(content) },
      ])
      .trim();
  } catch {
    return "";
  }
}

function compactCellProps(props: BlockNoteTableCell["props"]): Record<string, unknown> | null {
  if (!props) return null;
  const filtered: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
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
  return withHeadlessEditor((editor) => {
    const parts = blocks.map((b) => blockToXml(editor, b, 0));
    return `<blocknote version="${BLOCKNOTE_XML_VERSION}">\n${parts.join("\n")}\n</blocknote>`;
  });
}

function blockToXml(
  editor: HeadlessBlockNoteEditor,
  block: BlockNoteBlock,
  indent: number,
): string {
  const pad = "  ".repeat(indent);
  const id = typeof block.id === "string" ? block.id : "";
  const type = typeof block.type === "string" ? block.type : "";
  const openTag = `${pad}<block id="${escapeXmlAttribute(id)}" type="${escapeXmlAttribute(type)}"${propsAttribute(
    compactBlockProps(type, block.props),
  )}`;

  const children = Array.isArray(block.children) ? block.children : [];
  const content = block.content;
  const hasTable = isTableContent(content);
  const hasInline = content !== undefined && content !== null && !hasTable;

  if (!hasTable && !hasInline && children.length === 0) {
    return `${openTag}/>`;
  }

  const parts: string[] = [`${openTag}>`];

  if (hasInline) {
    const md = blockContentToMarkdown(editor, block);
    if (md) parts.push(`${pad}  ${escapeXmlText(md)}`);
  }

  if (hasTable) {
    parts.push(tableToXml(editor, content, indent + 1));
  }

  if (children.length > 0) {
    parts.push(`${pad}  <children>`);
    for (const child of children) {
      parts.push(blockToXml(editor, child, indent + 2));
    }
    parts.push(`${pad}  </children>`);
  }

  parts.push(`${pad}</block>`);
  return parts.join("\n");
}

function tableToXml(
  editor: HeadlessBlockNoteEditor,
  content: BlockNoteTableContent,
  indent: number,
): string {
  const pad = "  ".repeat(indent);

  let openTag = `${pad}<table`;
  if (content.headerRows !== undefined) openTag += ` headerRows="${content.headerRows}"`;
  if (content.headerCols !== undefined) openTag += ` headerCols="${content.headerCols}"`;
  openTag += ">";

  const cols: string[] = [`${pad}  <columns>`];
  for (const width of content.columnWidths ?? []) {
    cols.push(
      width !== undefined && width !== null
        ? `${pad}    <column width="${width}"/>`
        : `${pad}    <column/>`,
    );
  }
  cols.push(`${pad}  </columns>`);

  const rowParts: string[] = [];
  for (const row of content.rows) {
    rowParts.push(`${pad}  <row>`);
    for (const cell of row.cells) {
      // Legacy cells are bare inline-content arrays with no props of their own.
      const isStructured = isTableCellObj(cell);
      if (!isStructured && !Array.isArray(cell)) continue;
      const attr = isStructured ? propsAttribute(compactCellProps(cell.props)) : "";
      const md = inlineContentToMarkdown(editor, isStructured ? cell.content : cell);
      rowParts.push(
        md
          ? `${pad}    <cell${attr}>${escapeXmlText(md)}</cell>`
          : `${pad}    <cell${attr}/>`,
      );
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
  return withHeadlessEditor((editor, dom) => {
    const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");

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

    return Array.from(root.children).map((child) => {
      if (child.tagName !== "block") {
        throw new Error(
          `Invalid BlockNote XML: unexpected element <${child.tagName}> inside <blocknote>.`,
        );
      }
      return parseBlockElement(editor, child);
    });
  });
}

/** Parse a `props="…"` attribute into an object, or undefined when absent. */
function parsePropsAttribute(
  raw: string | null,
  context: string,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid BlockNote XML: ${context} has invalid props JSON: ${raw.slice(0, 100)}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid BlockNote XML: props must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseBlockElement(
  editor: HeadlessBlockNoteEditor,
  el: Element,
): BlockNoteBlockWithOptionalId {
  const id = el.getAttribute("id") ?? undefined;
  const type = el.getAttribute("type");
  if (!type) {
    throw new Error(`Invalid BlockNote XML: <block> is missing a "type" attribute.`);
  }
  const props = parsePropsAttribute(el.getAttribute("props"), `<block type="${type}">`);

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
  const content =
    tableContent !== undefined
      ? tableContent
      : trimmedMd
        ? parseMarkdownToInline(editor, trimmedMd)
        : undefined;

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
function parseMarkdownToInline(
  editor: HeadlessBlockNoteEditor,
  md: string,
): unknown[] {
  const blocks = editor.tryParseMarkdownToBlocks(md);
  if (!blocks || blocks.length === 0) return [];
  if (blocks.length > 1) {
    throw new Error(
      `Invalid BlockNote XML: block content produced ${blocks.length} blocks. Use separate <block> elements for multiple blocks.`,
    );
  }
  return ((blocks[0] as { content?: unknown[] }).content ?? []) as unknown[];
}

function parseTableElement(
  editor: HeadlessBlockNoteEditor,
  el: Element,
): BlockNoteTableContent {
  const headerRows = el.getAttribute("headerRows");
  const headerCols = el.getAttribute("headerCols");

  let columnWidths: (number | undefined)[] = [];
  const rows: Array<{ cells: BlockNoteTableCell[] }> = [];

  for (const child of Array.from(el.children)) {
    if (child.tagName === "columns") {
      columnWidths = Array.from(child.children).map((col) => {
        if (col.tagName !== "column") {
          throw new Error(`Invalid BlockNote XML: unexpected <${col.tagName}> inside <columns>.`);
        }
        const widthAttr = col.getAttribute("width");
        return widthAttr !== null ? Number(widthAttr) : undefined;
      });
    } else if (child.tagName === "row") {
      const cells = Array.from(child.children).map((cell) => {
        if (cell.tagName !== "cell") {
          throw new Error(`Invalid BlockNote XML: unexpected <${cell.tagName}> inside <row>.`);
        }
        const cellProps = parsePropsAttribute(cell.getAttribute("props"), "<cell>") ?? {};
        const cellMd = (cell.textContent ?? "").trim();
        return {
          type: "tableCell",
          props: {
            ...BLOCK_NOTE_DEFAULT_CELL_PROPS,
            ...cellProps,
          } as BlockNoteTableCell["props"],
          content: (cellMd
            ? parseMarkdownToInline(editor, cellMd)
            : []) as BlockNoteInlineContent[],
        } satisfies BlockNoteTableCell;
      });
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
