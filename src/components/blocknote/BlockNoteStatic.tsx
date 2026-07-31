import React, { memo, useMemo } from "react";
import type { PartialBlock } from "@blocknote/core";

import {
  extractInlineText,
  type BlockNoteBlock,
  type BlockNoteInlineContent,
} from "@/../convex/lib/blockNoteDocument";
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
 * Default BlockNote blocks (paragraph, heading, lists, quote, code, ...) are
 * mapped to semantic HTML elements (`<p>`, `<h1..6>`, `<ul>/<ol>`, `<blockquote>`,
 * `<pre><code>`, ...). Rare/unsupported default block types (table, file,
 * image, video, audio, toggle, columns) fall back to a per-block
 * `blocksToFullHTML` serialization; those use BlockNote's native DOM renderers
 * (not React specs) so the fallback is safe and never yields a blank node.
 *
 * The output is styled by `.bn-readonly-container` in blocknote-overrides.css,
 * which targets the same semantic HTML this component emits — so existing CSS
 * applies unchanged.
 */

// ── Fallback serializer (rare default block types only) ───────────────────
// A headless BlockNote editor used solely to serialize individual blocks that
// BlockNoteStatic does not map natively (table, file, image, ...). It MUST
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

  const style: React.CSSProperties = {};
  if (typeof s.textColor === "string" && s.textColor !== "default") {
    style.color = s.textColor;
  }
  if (typeof s.backgroundColor === "string" && s.backgroundColor !== "default") {
    style.backgroundColor = s.backgroundColor;
  }
  if (Object.keys(style).length > 0) {
    return (
      <span key={key} style={style}>
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
    // Link wraps styled text children.
    if (node.type === "link" && node.href) {
      return (
        <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
          {renderInlineContent(node.content)}
        </a>
      );
    }
    // Plain or styled text.
    return renderStyledText(node, key);
  });
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
    case "checkListItem":
      return own(
        // `bn-static-check-item` is the styling hook for blocknote-overrides.css,
        // which sizes the box and matches the editor's row rhythm.
        <div key={key} className="bn-static-check-item flex items-start gap-2">
          <input type="checkbox" checked={!!props.checked} disabled readOnly />
          <span>{renderInlineContent(content)}</span>
        </div>,
      );
    // List items are grouped into <ul>/<ol> by renderBlocks, not handled here.
    case "bulletListItem":
    case "numberedListItem":
      // Reached only if encountered outside grouping (defensive): render bare.
      return own(<li key={key}>{renderInlineContent(content)}</li>);
    default: {
      // Fallback for rare default types (table, file, image, video, audio,
      // toggle, columns): serialize the single block via the headless editor.
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
  return <div className={className}>{rendered}</div>;
}

export const BlockNoteStatic = memo(BlockNoteStaticImpl);
