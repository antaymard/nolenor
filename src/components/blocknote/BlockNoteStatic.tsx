import React, { memo, useMemo } from "react";
import type { PartialBlock } from "@blocknote/core";

import {
  extractInlineText,
  type BlockNoteBlock,
  type BlockNoteInlineContent,
  type BlockNoteTableCell,
  type BlockNoteTableContent,
} from "@/../convex/lib/blockNoteDocument";
import { cn } from "@/lib/utils";
import { findBlockView, findInlineContentView } from "./registry";

/**
 * BlockNoteStatic — read-only React renderer for BlockNote documents.
 *
 * This is the canvas / view-only counterpart of the editable `BlockNoteView`.
 * It walks the block tree and renders plain semantic React (no ProseMirror, no
 * `BlockNoteView`, no headless-editor `blocksToFullHTML`). Custom blocks and
 * inline content declared in the registry render through their `View`
 * component (e.g. `CalloutView`, `DatePillView`), which keeps them interactive-
 * free and lets them render as plain React in the live tree — the key fix for
 * custom blocks not showing on the canvas.
 *
 * Default BlockNote blocks (paragraph, heading, lists, quote, code, table, ...)
 * are mapped to semantic HTML elements (`<p>`, `<h1..6>`, `<ul>/<ol>`,
 * `<blockquote>`, `<pre><code>`, `<table>`, ...). Rare/unsupported default block
 * types (file, image, video, audio, toggle, columns) fall back to a per-block
 * `blocksToFullHTML` serialization; those use BlockNote's native DOM renderers
 * (not React specs) so the fallback is safe and never yields a blank node.
 *
 * The output is styled by `.bn-readonly-container` in blocknote-overrides.css,
 * which targets the same semantic HTML this component emits — so existing CSS
 * applies unchanged.
 */

// ── Fallback serializer (rare default block types only) ───────────────────
// A headless BlockNote editor used solely to serialize individual blocks that
// BlockNoteStatic does not map natively (file, image, video, ...). It MUST
// use the shared custom schema or it would throw on documents containing
// custom types. These default specs use pure-DOM renderers, so this path does
// not go through the fragile React `createRoot` serialization that breaks
// custom React specs — it is only ever called for non-React default blocks.
import { BlockNoteEditor } from "@blocknote/core";
import { blockNoteSchema, type AppBlockNoteEditor } from "./schema";

let fallbackEditor: AppBlockNoteEditor | null = null;
function getFallbackEditor(): AppBlockNoteEditor {
  if (!fallbackEditor) {
    fallbackEditor = BlockNoteEditor.create({ schema: blockNoteSchema });
  }
  return fallbackEditor;
}

function blockToHtml(block: BlockNoteBlock): string | null {
  try {
    return getFallbackEditor().blocksToFullHTML([block as PartialBlock]);
  } catch {
    return null;
  }
}

// ── Inline content ─────────────────────────────────────────────────────────

// Loose shape of a stored inline content node. `text` carries `text`+`styles`;
// `link` carries `href`+`content`; custom inline content (e.g. `date`) carries
// `props`. Kept permissive (string type) so custom-type dispatch compares
// against arbitrary strings.
interface InlineNode {
  type?: string;
  text?: string;
  styles?: Record<string, unknown>;
  href?: string;
  content?: BlockNoteInlineContent[];
  props?: Record<string, unknown>;
}

/**
 * Same favicon source LinkNode.tsx uses for its link-preview chip, so a link
 * reads as "a link" the same way everywhere in the app. Returns null on an
 * unparsable href (e.g. a relative or malformed URL) so the caller renders
 * the link text alone rather than a broken image.
 */
function faviconUrl(href: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(href).hostname}&sz=16`;
  } catch {
    return null;
  }
}

function renderStyledText(node: InlineNode, key: string): React.ReactNode {
  // Wrappers are applied inside-out; only the outermost one is a list child,
  // so the key goes on the final element rather than on every layer.
  let el: React.ReactNode = node.text ?? "";
  const s = node.styles || {};
  if (s.code) el = <code>{el}</code>;
  if (s.bold) el = <strong>{el}</strong>;
  if (s.italic) el = <em>{el}</em>;
  if (s.underline) el = <u>{el}</u>;
  if (s.strike) el = <s>{el}</s>;

  const textColor = colorAttr(s.textColor);
  const backgroundColor = colorAttr(s.backgroundColor);
  if (textColor || backgroundColor) {
    return (
      <span
        key={key}
        data-text-color={textColor}
        data-background-color={backgroundColor}
      >
        {el}
      </span>
    );
  }
  return <React.Fragment key={key}>{el}</React.Fragment>;
}

function renderInlineContent(
  content: BlockNoteInlineContent[] | undefined,
): React.ReactNode {
  if (!content || !Array.isArray(content)) return null;
  return content.map((c, i) => {
    const key = `ic-${i}`;
    if (typeof c === "string") {
      return <span key={key}>{c}</span>;
    }
    const node = c as InlineNode;
    // Custom inline content (e.g. date pill).
    if (node.type && node.type !== "text" && node.type !== "link") {
      const View = findInlineContentView(node.type);
      if (View) {
        return <View key={key} {...(node.props || {})} />;
      }
    }
    // Link wraps styled text children. Tailwind's preflight resets bare `a`
    // to `color:inherit;text-decoration:inherit` — the live editor fights
    // this with its own `.bn-shadcn .bn-editor a{color:revert}` rule
    // (@blocknote/shadcn/style.css), but that selector is scoped to
    // `.bn-editor` and never reaches this static renderer, so an unstyled
    // link here read as plain body text. `.bn-static-link` restates the
    // intent explicitly and adds a favicon "head" so a link stands out
    // inline even before the eye reaches the underline.
    //
    // The text is wrapped in its own span rather than left as a direct flex
    // child of `<a>`: a bare `<img>` next to a text run has an unconditional
    // line-break opportunity between them (CSS Text Module 3 — atomic inline
    // boxes always get one, whitespace or not), so the icon could end up
    // orphaned on its own line above the text. Making `.bn-static-link` a
    // flex row removes that internal break point — the icon and the *start*
    // of the text can never separate — while the single text span still
    // wraps normally across lines for long link text.
    if (node.type === "link" && node.href) {
      const favicon = faviconUrl(node.href);
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="bn-static-link"
        >
          {favicon && (
            <img
              src={favicon}
              alt=""
              className="bn-static-link-favicon"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <span className="bn-static-link-text">
            {renderInlineContent(node.content)}
          </span>
        </a>
      );
    }
    // Plain or styled text.
    return renderStyledText(node, key);
  });
}

// ── Tables ─────────────────────────────────────────────────────────────────

/** Fallback column width — BlockNote's own `--default-cell-min-width`. */
const DEFAULT_COLUMN_WIDTH = 120;

/** A cell is either a structured `tableCell` or, historically, a bare inline array. */
function isTableCell(cell: unknown): cell is BlockNoteTableCell {
  return (
    !!cell &&
    typeof cell === "object" &&
    !Array.isArray(cell) &&
    (cell as { type?: unknown }).type === "tableCell"
  );
}

/**
 * BlockNote colors are palette names ("gray", "blue", ...), and
 * `@blocknote/shadcn/style.css` styles them through `[data-text-color]` /
 * `[data-background-color]` selectors that are NOT scoped to `.bn-editor` —
 * so emitting the attribute is enough, no inline style needed.
 */
function colorAttr(value: unknown): string | undefined {
  return typeof value === "string" && value !== "default" ? value : undefined;
}

/**
 * BlockNote's own table CSS is scoped under `.bn-editor`, so serializing a
 * table through `blocksToFullHTML` (the generic fallback below) yielded an
 * unstyled `<table>`: correct column layout, no borders. Rendering it natively
 * gets it the `.bn-static-table` rules from blocknote-overrides.css, and —
 * unlike the fallback — routes cell content through `renderInlineContent`, so
 * custom inline content (the date pill) survives inside a cell.
 */
function renderTable(block: BlockNoteBlock, key: string): React.ReactNode {
  const content = block.content as BlockNoteTableContent | undefined;
  if (
    !content ||
    typeof content !== "object" ||
    content.type !== "tableContent" ||
    !Array.isArray(content.rows)
  ) {
    return null;
  }

  const headerRows = content.headerRows ?? 0;
  const headerCols = content.headerCols ?? 0;
  const columnCount = content.rows.reduce(
    (max, row) => Math.max(max, Array.isArray(row?.cells) ? row.cells.length : 0),
    0,
  );
  if (columnCount === 0) return null;
  const widths = Array.isArray(content.columnWidths) ? content.columnWidths : [];

  return (
    <div key={key} className="bn-static-table-wrapper">
      <table className="bn-static-table">
        <colgroup>
          {Array.from({ length: columnCount }, (_, i) => (
            <col
              key={i}
              style={{
                width:
                  typeof widths[i] === "number" && widths[i]
                    ? widths[i]
                    : DEFAULT_COLUMN_WIDTH,
              }}
            />
          ))}
        </colgroup>
        <tbody>
          {content.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {(Array.isArray(row?.cells) ? row.cells : []).map(
                (cell, colIndex) => {
                  const structured = isTableCell(cell) ? cell : null;
                  const inline = (
                    structured ? structured.content : cell
                  ) as BlockNoteInlineContent[] | undefined;
                  const props = structured?.props;
                  const colspan = props?.colspan;
                  const rowspan = props?.rowspan;
                  const Tag =
                    rowIndex < headerRows || colIndex < headerCols ? "th" : "td";
                  return (
                    <Tag
                      key={colIndex}
                      colSpan={colspan && colspan > 1 ? colspan : undefined}
                      rowSpan={rowspan && rowspan > 1 ? rowspan : undefined}
                      data-text-alignment={props?.textAlignment}
                      data-text-color={colorAttr(props?.textColor)}
                      data-background-color={colorAttr(props?.backgroundColor)}
                    >
                      {renderInlineContent(inline)}
                    </Tag>
                  );
                },
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Blocks ─────────────────────────────────────────────────────────────────

function renderBlockChildren(children: BlockNoteBlock[] | undefined): React.ReactNode {
  if (!children || children.length === 0) return null;
  return <>{renderBlocks(children)}</>;
}

/**
 * Render one block. `childrenIncluded` tells the caller whether the returned
 * node already contains the block's children — true for the HTML fallback,
 * which serializes the whole subtree — so children are not rendered twice.
 */
function renderBlock(
  block: BlockNoteBlock,
  key: string,
): { node: React.ReactNode; childrenIncluded: boolean } {
  const type = block.type;
  const props = (block.props || {}) as Record<string, unknown>;
  const content = block.content as BlockNoteInlineContent[] | undefined;
  const own = (node: React.ReactNode) => ({ node, childrenIncluded: false });

  // Custom block from the registry (e.g. callout).
  const CustomView = findBlockView(type);
  if (CustomView) {
    return own(
      <CustomView key={key} {...props}>
        {renderInlineContent(content)}
      </CustomView>,
    );
  }

  // Default blocks → semantic HTML matching the `.bn-readonly-container` CSS.
  switch (type) {
    case "paragraph":
      return own(<p key={key}>{renderInlineContent(content)}</p>);
    case "heading": {
      const level = (props.level as number | undefined) ?? 1;
      const Tag = `h${Math.min(Math.max(level, 1), 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return own(<Tag key={key}>{renderInlineContent(content)}</Tag>);
    }
    case "quote":
      return own(<blockquote key={key}>{renderInlineContent(content)}</blockquote>);
    case "codeBlock":
      return own(
        <pre key={key}>
          <code>{extractInlineText(content)}</code>
        </pre>,
      );
    case "divider":
      return own(<hr key={key} />);
    case "table":
      return own(renderTable(block, key));
    case "checkListItem":
      return own(
        // `bn-static-check-item` is the styling hook for blocknote-overrides.css,
        // which sizes the box and matches the editor's row rhythm. `data-checked`
        // mirrors the attribute the editor puts on its own check list blocks, so
        // one rule can drive the checked styling on both surfaces.
        //
        // The input is deliberately not `disabled`: the UA greys a disabled box
        // out, which made a ticked item hard to read. `readOnly` keeps React from
        // warning about a controlled input with no `onChange`, and the CSS makes
        // it inert.
        <div
          key={key}
          className="bn-static-check-item flex items-start gap-2"
          data-checked={props.checked ? "true" : "false"}
        >
          <input
            type="checkbox"
            checked={!!props.checked}
            readOnly
            tabIndex={-1}
          />
          <span>{renderInlineContent(content)}</span>
        </div>,
      );
    // List items are grouped into <ul>/<ol> by renderBlocks, not handled here.
    case "bulletListItem":
    case "numberedListItem":
      // Reached only if encountered outside grouping (defensive): render bare.
      return own(<li key={key}>{renderInlineContent(content)}</li>);
    default: {
      // Fallback for rare default types (file, image, video, audio, toggle,
      // columns): serialize the single block via the headless editor.
      // `blocksToFullHTML` emits the nested children too, hence
      // `childrenIncluded: true` — rendering them again would duplicate them.
      const html = blockToHtml(block);
      if (!html) return own(null);
      return {
        node: <div key={key} dangerouslySetInnerHTML={{ __html: html }} />,
        childrenIncluded: true,
      };
    }
  }
}

/** Render a flat list of blocks, grouping consecutive list items into lists. */
function renderBlocks(blocks: BlockNoteBlock[]): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const type = block.type;

    if (type === "bulletListItem" || type === "numberedListItem") {
      // Collect the run of consecutive same-type items.
      const items: BlockNoteBlock[] = [];
      while (i < blocks.length && blocks[i].type === type) {
        items.push(blocks[i]);
        i++;
      }
      const ListTag = type === "numberedListItem" ? "ol" : "ul";
      const start = type === "numberedListItem"
        ? (block.props as { start?: number } | undefined)?.start
        : undefined;
      out.push(
        <ListTag
          key={`list-${block.id}`}
          {...(start && start !== 1 ? { start } : {})}
        >
          {items.map((item) => (
            <li key={item.id}>
              {renderInlineContent(item.content as BlockNoteInlineContent[] | undefined)}
              {renderBlockChildren(item.children)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const { node, childrenIncluded } = renderBlock(block, block.id);
    out.push(node);
    // Non-list blocks can also have children (e.g. toggle): render them as an
    // indented sibling, unless the block's own rendering already covered them.
    if (!childrenIncluded && block.children && block.children.length > 0) {
      out.push(
        <div key={`children-${block.id}`} className="pl-4">
          {renderBlocks(block.children)}
        </div>,
      );
    }
    i++;
  }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────

interface BlockNoteStaticProps {
  blocks: BlockNoteBlock[];
  className?: string;
}

function BlockNoteStaticImpl({ blocks, className }: BlockNoteStaticProps) {
  const rendered = useMemo(() => renderBlocks(blocks), [blocks]);
  // `bn-root` only declares BlockNote's design tokens — in particular the
  // `--bn-colors-highlights-*` palette that its global `[data-text-color]` /
  // `[data-background-color]` rules resolve against. Without it those
  // attributes (emitted on table cells) resolve to an undefined variable and
  // the colour is silently dropped. The font-family it also sets is already
  // overridden for `.bn-root` in blocknote-overrides.css.
  return <div className={cn("bn-root", className)}>{rendered}</div>;
}

export const BlockNoteStatic = memo(BlockNoteStaticImpl);
