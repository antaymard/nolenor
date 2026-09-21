import type { Block } from "@blocknote/core";
import { extractInlineText } from "@/../convex/lib/blockNoteDocument";

export type Heading = { id: string; depth: number; title: string };

type HeadingCandidate = {
  type?: string;
  props?: { level?: unknown };
  content?: unknown;
  children?: unknown;
  id?: string;
};

/**
 * Collect headings in document order, descending into `children` so titles
 * nested inside a toggle, a column or a list item are not silently dropped.
 * `path` only feeds the fallback id for blocks that somehow lack one, so it
 * just has to be unique per position.
 */
function collectHeadings(
  blocks: unknown,
  headings: Heading[],
  path: string,
): void {
  if (!Array.isArray(blocks)) return;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HeadingCandidate | null;
    if (!block || typeof block !== "object") continue;
    const here = path ? `${path}-${i}` : `${i}`;
    if (block.type === "heading") {
      const title = extractInlineText(block.content).trim();
      if (title) {
        headings.push({
          id: block.id ?? `heading-${here}`,
          depth: typeof block.props?.level === "number" ? block.props.level : 1,
          title,
        });
      }
    }
    collectHeadings(block.children, headings, here);
  }
}

export function extractHeadings(doc: Block[] | undefined): Heading[] {
  const headings: Heading[] = [];
  collectHeadings(doc, headings, "");
  return headings;
}

/** Identity of a heading list, used to skip state updates on every keystroke. */
export function headingsSignature(headings: Heading[]): string {
  return JSON.stringify(headings.map((h) => [h.id, h.depth, h.title]));
}
