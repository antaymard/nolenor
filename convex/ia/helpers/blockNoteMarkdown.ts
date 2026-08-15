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
import { normalizeDatePillValue } from "../../lib/datePill";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";
import {
  withHeadlessEditor,
  type DomGlobals,
  type HeadlessBlockNoteEditor,
} from "./headlessBlockNote";
import { repairBlockNoteXml } from "./blockNoteXmlRepair";

export const BLOCKNOTE_XML_VERSION = "1";

// ── Frontend-only custom types ──────────────────────────────────────────────
//
// `date` (inline), `mention` (inline) and `callout` (block) are declared by
// the frontend schema (src/components/blocknote/). The headless editor runs
// the DEFAULT schema and throws "node type X not found in schema" on them, so
// all three are rewritten before anything is handed to it.
//
//  • callouts → paragraphs. Lossless for the agent: icon/color live in props,
//    which the XML carries independently of the headless editor.
//  • date pills → a text stand-in, in one of two flavours (see below).
//  • mention pills (a reference to another canvas node, see
//    src/components/blocknote/mention-inline-content.tsx) → the snapshot
//    title stored in their own props at insertion time. This codec is pure
//    (no `ctx.db`), so it cannot resolve the mentioned node's live title —
//    unlike date pills there is no round-trip token, an agent cannot author
//    one back from text.

/**
 * How a `date` pill is rendered when handed to the headless editor.
 *
 *  - `"token"` (XML codec): `[[date:YYYY-MM-DD]]`, which survives the Markdown
 *    round-trip untouched and is turned back into a real pill on parse. This
 *    is what makes pills lossless for the agent, and lets it author new ones.
 *  - `"label"` (search index): `📅 YYYY-MM-DD`, human-readable text for the
 *    full-text index, where a machine token would be noise.
 */
type DatePillMode = "token" | "label";

/** `[[date:YYYY-MM-DD]]` — the agent-facing spelling of a date pill. */
const DATE_TOKEN_RE = /\[\[date:(\d{4}-\d{2}-\d{2})\]\]/g;

export function formatDateToken(isoDate: string): string {
  return `[[date:${isoDate}]]`;
}

function datePillStandIn(props: unknown, mode: DatePillMode): string {
  const raw = (props as Record<string, unknown> | undefined)?.date;
  const iso = normalizeDatePillValue(typeof raw === "string" ? raw : "");
  if (mode === "label") return iso ? `📅 ${iso}` : "📅";
  // An unparseable legacy value has no ISO form, so it cannot round-trip as a
  // pill; degrade to the readable label rather than emit a malformed token.
  return iso ? formatDateToken(iso) : "📅";
}

/**
 * Text stand-in for a `mention` pill: the snapshot title taken when the pill
 * was inserted (see mention-inline-content.tsx). No `mode` distinction like
 * date pills — there is no token form to round-trip, so this is always the
 * readable form.
 */
function mentionStandIn(props: unknown): string {
  const title = (props as Record<string, unknown> | undefined)?.title;
  return typeof title === "string" && title.trim() ? title.trim() : "Node";
}

function frontendOnlyInlineToText(content: unknown, mode: DatePillMode): unknown {
  if (typeof content === "string" || content === undefined || content === null) {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((node) => {
      if (typeof node !== "object" || node === null) return node;
      const n = node as Record<string, unknown>;
      if (n.type === "date") {
        return { type: "text", text: datePillStandIn(n.props, mode) };
      }
      if (n.type === "mention") {
        return { type: "text", text: mentionStandIn(n.props) };
      }
      if (n.content !== undefined) {
        return { ...n, content: frontendOnlyInlineToText(n.content, mode) };
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
                content: frontendOnlyInlineToText(
                  cell.content,
                  mode,
                ) as BlockNoteInlineContent[],
              }
            : frontendOnlyInlineToText(cell, mode),
        ),
      })),
    };
  }
  return content;
}

// ── Emphasis whitespace normalization ───────────────────────────────────────
//
// Markdown emphasis delimiters cannot hug whitespace: `** apres**` is literal
// text, not bold. BlockNote's serializer trims the OPENING side but not the
// closing one, so a styled leaf with leading whitespace that follows any inline
// node (a link, a date pill) survives serialization as raw `** apres**` and
// parses back as literal asterisks — styling lost, delimiters visible.
//
// Moving the whitespace out of the styled run before serialization sidesteps
// the whole class: the text is identical, only the span boundary moves. Applied
// to bold/italic/strike only — `code` spans can legitimately hold whitespace,
// and underline has no Markdown form anyway.

const DELIMITED_STYLES = ["bold", "italic", "strike"] as const;

function hasDelimitedStyle(styles: unknown): boolean {
  return isPlainObject(styles) && DELIMITED_STYLES.some((s) => styles[s]);
}

function normalizeEmphasisWhitespace(content: unknown): unknown {
  if (!Array.isArray(content)) return content;

  const out: unknown[] = [];
  for (const node of content) {
    if (isPlainObject(node) && node.type === "link" && Array.isArray(node.content)) {
      out.push({ ...node, content: normalizeEmphasisWhitespace(node.content) });
      continue;
    }
    if (
      !isPlainObject(node) ||
      node.type !== "text" ||
      typeof node.text !== "string" ||
      !hasDelimitedStyle(node.styles)
    ) {
      out.push(node);
      continue;
    }

    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text)!;
    if (!lead && !trail) {
      out.push(node);
      continue;
    }
    // An all-whitespace styled leaf has no core to emphasise: emit it bare.
    if (!core) {
      out.push({ type: "text", text: node.text, styles: {} });
      continue;
    }
    if (lead) out.push({ type: "text", text: lead, styles: {} });
    out.push({ ...node, text: core });
    if (trail) out.push({ type: "text", text: trail, styles: {} });
  }
  return out;
}

/**
 * Rewrite one block's own type/props/content for the default-schema headless
 * editor. Children are NOT touched — callers that need a whole subtree use
 * `sanitizeBlockForHeadless`, callers that serialize a single block's inline
 * content use this and drop the children entirely.
 */
function sanitizeBlockShallow(block: BlockNoteBlock, mode: DatePillMode): BlockNoteBlock {
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
  if (out.content !== undefined) {
    out.content = normalizeEmphasisWhitespace(
      frontendOnlyInlineToText(out.content, mode),
    );
  }
  return out;
}

/** Recursively rewrite frontend-only custom types for the headless editor. */
function sanitizeBlockForHeadless(
  block: BlockNoteBlock,
  mode: DatePillMode,
): BlockNoteBlock {
  const out = sanitizeBlockShallow(block, mode);
  if (Array.isArray(out.children)) {
    out.children = out.children.map((child) => sanitizeBlockForHeadless(child, mode));
  }
  return out;
}

// ── Date tokens → pills (parse side) ────────────────────────────────────────

/**
 * Turn `[[date:YYYY-MM-DD]]` occurrences inside parsed inline content back into
 * real `date` inline nodes. Runs after the Markdown parser, so a token that sat
 * inside styled text or a link is split out of its leaf while the surrounding
 * text keeps its styles.
 *
 * Code spans are left alone, which is the escape hatch: `` `[[date:…]]` ``
 * documents the syntax without turning into a pill.
 */
function expandDateTokens(content: unknown): unknown {
  if (!Array.isArray(content)) return content;

  const out: unknown[] = [];
  for (const node of content) {
    if (isPlainObject(node) && node.type === "link" && Array.isArray(node.content)) {
      out.push({ ...node, content: expandDateTokens(node.content) });
      continue;
    }
    if (
      !isPlainObject(node) ||
      node.type !== "text" ||
      typeof node.text !== "string" ||
      !node.text.includes("[[date:") ||
      (isPlainObject(node.styles) && node.styles.code)
    ) {
      out.push(node);
      continue;
    }

    const styles = node.styles;
    let cursor = 0;
    DATE_TOKEN_RE.lastIndex = 0;
    for (
      let match = DATE_TOKEN_RE.exec(node.text);
      match;
      match = DATE_TOKEN_RE.exec(node.text)
    ) {
      const before = node.text.slice(cursor, match.index);
      if (before) out.push({ type: "text", text: before, styles });
      out.push({ type: "date", props: { date: match[1] } });
      cursor = match.index + match[0].length;
    }
    const rest = node.text.slice(cursor);
    if (rest) out.push({ type: "text", text: rest, styles });
  }
  return out;
}

/** Apply `expandDateTokens` to a whole parsed block tree (content + tables + children). */
function expandDateTokensInBlocks<T extends BlockNoteBlockWithOptionalId>(
  blocks: T[],
): T[] {
  return blocks.map((block) => {
    const out = { ...block };
    if (isTableContent(out.content)) {
      out.content = {
        ...out.content,
        rows: out.content.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) =>
            isTableCellObj(cell)
              ? {
                  ...cell,
                  content: expandDateTokens(cell.content) as BlockNoteInlineContent[],
                }
              : (expandDateTokens(cell) as BlockNoteInlineContent[]),
          ),
        })),
      };
    } else if (out.content !== undefined) {
      out.content = expandDateTokens(out.content);
    }
    if (Array.isArray(out.children)) {
      out.children = expandDateTokensInBlocks(out.children);
    }
    return out;
  });
}

// ── Search-only helper (not used by the XML codec) ──────────────────────────

export async function blocksToMarkdown(blocks: BlockNoteBlock[]): Promise<string> {
  return withHeadlessEditor((editor) =>
    editor.blocksToMarkdownLossy(
      blocks.map((block) => sanitizeBlockForHeadless(block, "label")),
    ),
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
  return withHeadlessEditor((editor) =>
    // `[[date:…]]` tokens are honoured here too, so a full Markdown replace can
    // author real date pills rather than leaving the literal text behind.
    expandDateTokensInBlocks(
      (editor.tryParseMarkdownToBlocks(markdown) ??
        []) as BlockNoteBlockWithOptionalId[],
    ),
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTableContent(content: unknown): content is BlockNoteTableContent {
  return isPlainObject(content) && content.type === "tableContent";
}

function isTableCellObj(cell: unknown): cell is BlockNoteTableCell {
  return isPlainObject(cell) && cell.type === "tableCell";
}

/** Serialize a block's own inline content to Markdown (children excluded). */
function blockContentToMarkdown(
  editor: HeadlessBlockNoteEditor,
  block: BlockNoteBlock,
): string {
  // `children` is dropped BEFORE sanitizing: sanitizing first would deep-copy
  // the whole subtree only to throw it away, making serialization quadratic on
  // nested documents (this runs once per block).
  const synthetic = sanitizeBlockShallow({ ...block, children: [] }, "token");
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
        {
          id: "tmp",
          type: "paragraph",
          content: normalizeEmphasisWhitespace(
            frontendOnlyInlineToText(content, "token"),
          ),
        },
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
// Uses DOMParser with application/xml (never HTML).
//
// Liberal in what it accepts, strict in what it emits: the serializer always
// produces `<blocknote version="1">`, but a model writing the payload by hand
// should not have to rediscover that envelope. Observed in the wild: three
// failed tool calls in a row (bare `<block>` elements → "documents may contain
// only one root", then `<blocks>`, then `<blocknote>` without a version) before
// a fourth attempt landed. All three of those now parse.
//
// The same liberality extends to the payload's own well-formedness. A model
// writing prose into XML text nodes will sooner or later write `R&D` or
// `a < b`, or run out of `</block>` tags on a long document — and the DOM
// parser reports all three as something else entirely, at a line far from the
// cause (see blockNoteXmlRepair.ts). Those are repaired mechanically rather
// than bounced back as a diagnostic the model has to reverse-engineer.
//
// What is still rejected: a root whose children are not `<block>`/`<table>`,
// an explicit `version` other than the current one, and every per-block error
// (bad props JSON, unknown child elements, content spanning several blocks).
//
// Parsing logic per <block>:
//   - <table> child element → table content
//   - <children> child element → nested blocks
//   - text nodes (concatenated, trimmed) → inline Markdown, parsed via editor.
//     A Markdown pipe table there becomes table content and retypes the block
//     to `table` — writing one is by far the most natural way to ask for a
//     table, and the structured <table> element is unreachable to a model that
//     has never seen one in read_nodes output.

/**
 * Appended to every parse failure. A tool error is the only feedback the model
 * gets, so it carries the target shape rather than just the diagnosis —
 * otherwise the next attempt is another guess.
 */
const XML_FORMAT_HINT =
  "Expected: one or more <block> elements, optionally wrapped in <blocknote>; " +
  "each <block> closed by </block>, its text content plain Markdown " +
  '(& and < need no escaping). Example: <block type="paragraph">Some ' +
  '**markdown**</block>. Tables: <block type="table">| A | B |\n| --- | --- |\n| 1 | 2 |</block>';

function xmlError(message: string): Error {
  return new Error(`Invalid BlockNote XML: ${message} ${XML_FORMAT_HINT}`);
}

/**
 * DOM parser diagnostics come prefixed with `line:column:` into a payload the
 * model wrote as one long JSON string — a position it cannot map back to its
 * own text. Quoting the line is what makes the diagnosis actionable.
 */
function describeXmlParseError(xml: string, message: string): string {
  const position = /^(\d+):\d+:\s*/.exec(message);
  if (!position) return message;
  const line = xml.split("\n")[Number(position[1]) - 1];
  if (line === undefined) return message;
  return `${message.slice(position[0].length)} (at line ${position[1]}: ${line.trim().slice(0, 120)})`;
}

type ParsedXml = { root: Element } | { error: string };

function parseXmlDocument(dom: DomGlobals, xml: string): ParsedXml {
  const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");
  const errors = doc.getElementsByTagName("parsererror");
  if (errors.length > 0) {
    return { error: errors[0].textContent?.slice(0, 200) ?? "parse error" };
  }
  const root = doc.documentElement;
  return root ? { root } : { error: "the document is empty." };
}

/**
 * Parse the payload, retrying inside a synthetic root if it does not stand on
 * its own. XML has no multi-root documents, so a bare run of sibling `<block>`
 * elements — the most natural thing to write — only parses once wrapped.
 * Trying as-is first is what lets a real container root (`<blocknote>`,
 * `<blocks>`, …) stay the root instead of being nested inside the wrapper.
 *
 * Only once BOTH raw shapes have failed is the repair pass applied, so a
 * payload that was already well-formed is never rewritten.
 */
function parseFragmentOrDocument(dom: DomGlobals, xml: string): ParsedXml {
  const wrap = (payload: string) =>
    `<blocknote version="${BLOCKNOTE_XML_VERSION}">${payload}</blocknote>`;

  const direct = parseXmlDocument(dom, xml);
  if ("root" in direct) return direct;

  const wrapped = parseXmlDocument(dom, wrap(xml));
  if ("root" in wrapped) return wrapped;

  const repaired = repairBlockNoteXml(xml);
  const repairedDirect = parseXmlDocument(dom, repaired);
  if ("root" in repairedDirect) return repairedDirect;

  const repairedWrapped = parseXmlDocument(dom, wrap(repaired));
  if ("root" in repairedWrapped) return repairedWrapped;

  // Report the ORIGINAL diagnosis: its line numbers point into the text the
  // model actually wrote, whereas the repaired payload's do not.
  return { error: describeXmlParseError(xml, direct.error) };
}

export async function parseBlockNoteXml(
  xml: string,
): Promise<BlockNoteBlockWithOptionalId[]> {
  return withHeadlessEditor((editor, dom) => {
    const parsed = parseFragmentOrDocument(dom, xml);
    if ("error" in parsed) throw xmlError(parsed.error);
    const { root } = parsed;

    // A lone `<block>` is a valid XML document in its own right, and so is a
    // lone `<table>` — the shorthand for a document that is just one table.
    if (root.tagName === "block") return [parseBlockElement(editor, root)];
    if (root.tagName === "table") return [tableBlock(editor, root)];

    // Otherwise the root is just an envelope. `<blocknote>` is what the
    // serializer emits, but any container the model reaches for (`<blocks>`,
    // `<fragment>`, …) is accepted — the meaningful check is on the children.
    if (root.tagName === "blocknote") {
      const version = root.getAttribute("version");
      // Absent means "current"; a different explicit version is the real
      // forward-compatibility signal and stays an error.
      if (version !== null && version !== BLOCKNOTE_XML_VERSION) {
        throw xmlError(
          `expected version="${BLOCKNOTE_XML_VERSION}", got version="${version}".`,
        );
      }
    }

    const blocks = Array.from(root.children).map((child) => {
      if (child.tagName === "table") return tableBlock(editor, child);
      if (child.tagName !== "block") {
        throw xmlError(
          `unexpected element <${child.tagName}> inside <${root.tagName}>.`,
        );
      }
      return parseBlockElement(editor, child);
    });

    // A payload that reads as well-formed XML yet yields nothing means every
    // `<block` in it degraded to text — a malformed start tag the repair pass
    // could not recover. Returning `[]` would drop the content silently; say
    // so instead, since the tool's own "produced no blocks" is the same
    // message for an empty payload and for a lost one.
    if (blocks.length === 0 && /<\s*block\b/i.test(xml)) {
      throw xmlError(
        "no <block> element could be read, although the payload contains " +
          "`<block`. Check the start tags — most often an attribute value " +
          "whose quoting is broken by a quote inside it.",
      );
    }
    return blocks;
  });
}

/** A bare `<table>` element standing in for `<block type="table">…</block>`. */
function tableBlock(
  editor: HeadlessBlockNoteEditor,
  el: Element,
): BlockNoteBlockWithOptionalId {
  return { type: "table", content: parseTableElement(editor, el) };
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
    throw xmlError(`${context} has invalid props JSON: ${raw.slice(0, 100)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw xmlError(`props must be a JSON object.`);
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
    throw xmlError(`<block> is missing a "type" attribute.`);
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
          throw xmlError(`<block type="${type}"> has multiple <table> elements.`);
        }
        tableContent = parseTableElement(editor, elem);
        break;
      case "children":
        for (const grandChild of Array.from(elem.children)) {
          if (grandChild.tagName !== "block") {
            throw xmlError(`unexpected <${grandChild.tagName}> inside <children>.`);
          }
          children.push(parseBlockElement(editor, grandChild));
        }
        break;
      // A `<block>` written directly inside another one, without the
      // `<children>` wrapper. It can only mean nesting — there is nothing else
      // a block inside a block could be — so honour it instead of rejecting a
      // payload whose intent is unambiguous.
      case "block":
        children.push(parseBlockElement(editor, elem));
        break;
      default:
        throw xmlError(`unexpected <${elem.tagName}> inside <block>.`);
    }
  }

  // Parse the accumulated text as Markdown to produce inline content.
  const trimmedMd = markdownText.trim();
  const parsedText =
    tableContent === undefined && trimmedMd
      ? parseMarkdownBlockContent(editor, trimmedMd)
      : undefined;

  const table =
    tableContent ?? (parsedText?.kind === "table" ? parsedText.content : undefined);
  const content = table ?? (parsedText?.kind === "inline" ? parsedText.content : undefined);

  // Table content only belongs on a `table` block: a paragraph carrying it is
  // structurally invalid and crashes editor construction on the client. The
  // model asked for a table, so give it one rather than persisting the wreck.
  const retyped = table !== undefined && type !== "table";
  const block: BlockNoteBlockWithOptionalId = {
    type: retyped ? "table" : type,
  };
  if (id) block.id = id;
  // A retyped block's props described the type it no longer has (a heading's
  // `level`, say), which `table` has no schema entry for.
  if (props && !retyped) block.props = props;
  if (content !== undefined) block.content = content;
  if (children.length > 0) block.children = children;
  return block;
}

/**
 * A `<block>`'s (or `<cell>`'s) Markdown text, parsed. The Markdown must
 * produce exactly one block: either an ordinary one, whose inline content is
 * extracted (with `[[date:…]]` tokens becoming real date pills), or a pipe
 * table, whose whole table content is taken as-is.
 */
type ParsedBlockContent =
  | { kind: "inline"; content: unknown[] }
  | { kind: "table"; content: BlockNoteTableContent };

function parseMarkdownBlockContent(
  editor: HeadlessBlockNoteEditor,
  md: string,
): ParsedBlockContent {
  const blocks = editor.tryParseMarkdownToBlocks(md);
  if (!blocks || blocks.length === 0) return { kind: "inline", content: [] };
  if (blocks.length > 1) {
    const types = blocks
      .map((b) => (b as { type?: string }).type ?? "?")
      .join(", ");
    throw xmlError(
      `block content produced ${blocks.length} blocks (${types}). Use one <block> element per block.`,
    );
  }
  const content = (blocks[0] as { content?: unknown }).content;
  // BlockNote's own Markdown parser emits the fully structured `tableContent`
  // (header row, per-cell props), so a pipe table needs no conversion here.
  if (isTableContent(content)) return { kind: "table", content };
  return {
    kind: "inline",
    content: expandDateTokens((content ?? []) as unknown[]) as unknown[],
  };
}

/** `parseMarkdownBlockContent` for the places that can only hold inline content. */
function parseMarkdownToInline(
  editor: HeadlessBlockNoteEditor,
  md: string,
  context: string,
): unknown[] {
  const parsed = parseMarkdownBlockContent(editor, md);
  if (parsed.kind === "table") {
    throw xmlError(
      `${context} contains a Markdown table, which cannot be used as inline content.`,
    );
  }
  return parsed.content;
}

// The serializer emits `<row>`/`<cell>`, but a model that has never seen a
// table in read_nodes output writes the HTML it knows. Accepting both spellings
// costs two lookups and removes a whole class of rejected payloads.
const ROW_TAGS: ReadonlySet<string> = new Set(["row", "tr"]);
const CELL_TAGS: ReadonlySet<string> = new Set(["cell", "td", "th"]);
const ROW_GROUP_TAGS: ReadonlySet<string> = new Set(["thead", "tbody", "tfoot"]);

function parseTableCell(
  editor: HeadlessBlockNoteEditor,
  cell: Element,
): BlockNoteTableCell {
  const cellProps = parsePropsAttribute(cell.getAttribute("props"), "<cell>") ?? {};
  // Walk childNodes explicitly rather than reading `cell.textContent`:
  // that getter silently concatenates all descendant text regardless of
  // intervening tags, so a stray element (e.g. an LLM writing a nested
  // <blocks><block>...</block></blocks> wrapper instead of plain
  // Markdown) would be laundered away instead of rejected. A cell's
  // content is always plain Markdown text — the serializer (tableToXml)
  // never emits element children inside <cell> — so any element here is
  // malformed input, consistent with the discipline parseBlockElement
  // already applies to <block>/<children>.
  let cellMd = "";
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === 3 /* TEXT */) {
      cellMd += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== 1 /* ELEMENT */) continue;
    throw xmlError(
      `<cell> contains unexpected <${(child as Element).tagName}> element; cell content must be plain Markdown text, not nested elements.`,
    );
  }
  cellMd = cellMd.trim();
  return {
    type: "tableCell",
    props: {
      ...BLOCK_NOTE_DEFAULT_CELL_PROPS,
      ...cellProps,
    } as BlockNoteTableCell["props"],
    content: (cellMd
      ? parseMarkdownToInline(editor, cellMd, "<cell>")
      : []) as BlockNoteInlineContent[],
  } satisfies BlockNoteTableCell;
}

function parseTableRow(
  editor: HeadlessBlockNoteEditor,
  row: Element,
): { cells: BlockNoteTableCell[] } {
  return {
    cells: Array.from(row.children).map((cell) => {
      if (!CELL_TAGS.has(cell.tagName)) {
        throw xmlError(`unexpected <${cell.tagName}> inside <${row.tagName}>.`);
      }
      return parseTableCell(editor, cell);
    }),
  };
}

function emptyTableCell(): BlockNoteTableCell {
  return {
    type: "tableCell",
    props: { ...BLOCK_NOTE_DEFAULT_CELL_PROPS },
    content: [],
  };
}

/** True as soon as any cell declares a span, which makes row width implicit. */
function hasSpans(rows: Array<{ cells: BlockNoteTableCell[] }>): boolean {
  return rows.some((row) =>
    row.cells.some((cell) => {
      const props = cell.props as Record<string, unknown> | undefined;
      return (
        (typeof props?.colspan === "number" && props.colspan > 1) ||
        (typeof props?.rowspan === "number" && props.rowspan > 1)
      );
    }),
  );
}

function parseTableElement(
  editor: HeadlessBlockNoteEditor,
  el: Element,
): BlockNoteTableContent {
  const headerRows = el.getAttribute("headerRows");
  const headerCols = el.getAttribute("headerCols");

  let columnWidths: (number | undefined)[] = [];
  const rows: Array<{ cells: BlockNoteTableCell[] }> = [];
  // `<th>` in the first row is how HTML spells `headerRows="1"`.
  let firstRowIsHeader = false;

  const collectRow = (row: Element) => {
    if (rows.length === 0) {
      firstRowIsHeader =
        row.children.length > 0 &&
        Array.from(row.children).every((cell) => cell.tagName === "th");
    }
    rows.push(parseTableRow(editor, row));
  };

  for (const child of Array.from(el.children)) {
    if (child.tagName === "columns") {
      columnWidths = Array.from(child.children).map((col) => {
        if (col.tagName !== "column") {
          throw xmlError(`unexpected <${col.tagName}> inside <columns>.`);
        }
        const widthAttr = col.getAttribute("width");
        return widthAttr !== null ? Number(widthAttr) : undefined;
      });
    } else if (ROW_TAGS.has(child.tagName)) {
      collectRow(child);
    } else if (ROW_GROUP_TAGS.has(child.tagName)) {
      for (const row of Array.from(child.children)) {
        if (!ROW_TAGS.has(row.tagName)) {
          throw xmlError(`unexpected <${row.tagName}> inside <${child.tagName}>.`);
        }
        collectRow(row);
      }
    } else {
      throw xmlError(`unexpected <${child.tagName}> inside <table>.`);
    }
  }

  // A ragged table (rows of unequal length) is what a hand-written one looks
  // like when a cell is forgotten. BlockNote lays cells out on a fixed grid, so
  // pad the short rows instead of leaving the client to render a hole. Skipped
  // when any span is declared: there, a short row is the correct encoding.
  if (rows.length > 0 && !hasSpans(rows)) {
    const width = Math.max(...rows.map((row) => row.cells.length));
    for (const row of rows) {
      while (row.cells.length < width) row.cells.push(emptyTableCell());
    }
    // The serializer always writes <columns>, but a hand-written table rarely
    // does; BlockNote expects one entry per column.
    while (columnWidths.length < width) columnWidths.push(undefined);
  }

  const result: BlockNoteTableContent = {
    type: "tableContent",
    columnWidths,
    rows,
  };
  if (headerRows !== null) result.headerRows = Number(headerRows);
  else if (firstRowIsHeader) result.headerRows = 1;
  if (headerCols !== null) result.headerCols = Number(headerCols);
  return result;
}
