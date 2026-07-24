import { memo, useMemo } from "react";
import type { PartialBlock } from "@blocknote/core";

import type { BlockNoteBlock, BlockNoteInlineContent } from "@/../convex/lib/blockNoteDocument";
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
  let el: React.ReactNode = node.text ?? "";
  const s = node.styles || {};
  if (s.code) el = <code key={key}>{el}</code>;
  if (s.bold) el = <strong key={key}>{el}</strong>;
  if (s.italic) el = <em key={key}>{el}</em>;
  if (s.underline) el = <u key={key}>{el}</u>;
  if (s.strike) el = <s key={key}>{el}</s>;
  const style: React.CSSProperties = {};
  if (typeof s.textColor === "string" && s.textColor !== "default") {
    style.color = s.textColor;
  }
  if (typeof s.backgroundColor === "string" && s.backgroundColor !== "default") {
    style.backgroundColor = s.backgroundColor;
  }
  if (Object.keys(style).length > 0) {
    el = (
      <span key={key} style={style}>
        {el}
      </span>
    );
  }
  return el;
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

function renderBlock(block: BlockNoteBlock, key: string): React.ReactNode {
  const type = block.type;
  const props = (block.props || {}) as Record<string, unknown>;
  const content = block.content as BlockNoteInlineContent[] | undefined;

  // Custom block from the registry (e.g. callout).
  const CustomView = findBlockView(type);
  if (CustomView) {
    return (
      <CustomView key={key} {...props}>
        {renderInlineContent(content)}
      </CustomView>
    );
  }

  // Default blocks → semantic HTML matching the `.bn-readonly-container` CSS.
  switch (type) {
    case "paragraph":
      return <p key={key}>{renderInlineContent(content)}</p>;
    case "heading": {
      const level = (props.level as number | undefined) ?? 1;
      const Tag = `h${Math.min(Math.max(level, 1), 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{renderInlineContent(content)}</Tag>;
    }
    case "quote":
      return <blockquote key={key}>{renderInlineContent(content)}</blockquote>;
    case "codeBlock": {
      const text = extractPlainText(content);
      return (
        <pre key={key}>
          <code>{text}</code>
        </pre>
      );
    }
    case "divider":
      return <hr key={key} />;
    case "checkListItem":
      return (
        <div key={key} className="flex items-start gap-2">
          <input type="checkbox" checked={!!props.checked} disabled readOnly />
          <span>{renderInlineContent(content)}</span>
        </div>
      );
    // List items are grouped into <ul>/<ol> by renderBlocks, not handled here.
    case "bulletListItem":
    case "numberedListItem":
      // Reached only if encountered outside grouping (defensive): render bare.
      return <li key={key}>{renderInlineContent(content)}</li>;
    default: {
      // Fallback for rare default types (table, file, image, video, audio,
      // toggle, columns): serialize the single block via the headless editor.
      const html = blockToHtml(block);
      if (html) {
        return <div key={key} dangerouslySetInnerHTML={{ __html: html }} />;
      }
      return null;
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
          key={`list-${out.length}`}
          {...(start && start !== 1 ? { start } : {})}
        >
          {items.map((item, j) => (
            <li key={`li-${j}`}>
              {renderInlineContent(item.content as BlockNoteInlineContent[] | undefined)}
              {renderBlockChildren(item.children)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    out.push(renderBlock(block, `b-${out.length}`));
    // Non-list blocks can also have children (e.g. toggle). Render them after.
    const rendered = out[out.length - 1];
    if (block.children && block.children.length > 0) {
      out.push(
        <div key={`kids-${out.length}`} className="pl-4">
          {renderBlocks(block.children)}
        </div>,
      );
      // Note: `rendered` kept as-is; the children wrapper is a sibling.
      void rendered;
    }
    i++;
  }
  return out;
}

function extractPlainText(content: BlockNoteInlineContent[] | undefined): string {
  if (!content) return "";
  return content
    .map((c) => {
      if (typeof c === "string") return c;
      const node = c as InlineNode;
      if (node.text) return node.text;
      if (node.content) return extractPlainText(node.content);
      return "";
    })
    .join("");
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
