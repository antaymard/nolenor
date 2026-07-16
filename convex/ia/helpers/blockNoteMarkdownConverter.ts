/* eslint-disable @typescript-eslint/no-explicit-any */
// BlockNote <-> Markdown conversion for the agent layer.
//
// Mirrors plateMarkdownConverter.ts: dynamic imports dodge Convex's deploy-time
// bundling analysis (BlockNote chunks reference `document`/`window` eagerly).
// Unlike Plate (which never touches a real DOM at runtime), BlockNote's
// markdown export/parse genuinely needs a DOM — provided here by jsdom.
//
// Runtime requirement: every calling action MUST run in a `"use node"` context
// (noleCompletion.ts, worker.ts, chunkBuilder.ts all do). jsdom is a real Node
// dependency and cannot run in the plain V8 isolate.

import { generateBlockId } from "./blocknoteBlockTree";

// ── jsdom globals + concurrency lock ───────────────────────────────────────
// The ProseMirror DOMParser used by `tryParseMarkdownToBlocks` reads
// `globalThis.document`. We monkeypatch it for the duration of each conversion.
// Concurrent tool calls in the same Node process would interleave incompatible
// globals, so a single in-flight mutex serializes all jsdom-touching work.

type DomGlobals = { document: Document; window: Window & typeof globalThis };

let domPromise: Promise<DomGlobals> | null = null;
let editorPromise: Promise<any> | null = null;
let jsdomLock: Promise<void> = Promise.resolve();

async function getDom(): Promise<DomGlobals> {
  if (domPromise) return domPromise;
  domPromise = (async () => {
    const { JSDOM } = await import("jsdom");
    const jsdom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "http://localhost/",
      pretendToBeVisual: true,
    });
    const w = jsdom.window as unknown as Window & typeof globalThis;
    return { document: w.document, window: w };
  })();
  return domPromise;
}

async function withJsdomLock<T>(fn: () => T | Promise<T>): Promise<T> {
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
    return await fn();
  } finally {
    (globalThis as { document?: Document }).document = savedDoc;
    (globalThis as { window?: Window }).window = savedWin;
    release();
  }
}

async function getEditor(): Promise<any> {
  if (editorPromise) return editorPromise;
  editorPromise = (async () => {
    const dom = await getDom();
    const g = globalThis as { document?: Document; window?: Window };
    const savedDoc = g.document;
    const savedWin = g.window;
    (globalThis as { document?: Document }).document = dom.document;
    (globalThis as { window?: Window }).window = dom.window;
    try {
      const { BlockNoteEditor } = await import("@blocknote/core");
      return BlockNoteEditor.create();
    } finally {
      (globalThis as { document?: Document }).document = savedDoc;
      (globalThis as { window?: Window }).window = savedWin;
    }
  })();
  return editorPromise;
}

// ── Public conversion API ──────────────────────────────────────────────────
// `tryParseMarkdownToBlocks` / `blocksToMarkdownLossy` are synchronous on the
// editor, but wrapped in a Promise because of the lazy editor + jsdom setup.

export async function markdownToBlocks(markdown: string): Promise<any[]> {
  return withJsdomLock(async () => {
    const editor = await getEditor();
    return editor.tryParseMarkdownToBlocks(markdown) as any[];
  });
}

export async function blocksToMarkdown(blocks: any[]): Promise<string> {
  return withJsdomLock(async () => {
    const editor = await getEditor();
    return editor.blocksToMarkdownLossy(blocks) as string;
  });
}

// ── Annotated markdown (the read format the LLM consumes) ──────────────────
// Each block is wrapped in `<block id="…" type="…" props='{…}'>…</block>`,
// with children nested and indented. Props are included only when non-default
// (lossless yet terse).

const DEFAULT_PROP_VALUES: Record<string, unknown> = {
  textAlignment: "left",
  textColor: "default",
  backgroundColor: "default",
  level: 1,
  isToggleable: false,
};

function compactProps(
  props: unknown,
): Record<string, unknown> | null {
  if (!props || typeof props !== "object") return null;
  const p = props as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(p)) {
    const val = p[key];
    const def = DEFAULT_PROP_VALUES[key];
    if (def !== undefined && val === def) continue;
    filtered[key] = val;
  }
  return Object.keys(filtered).length === 0 ? null : filtered;
}

// Attributes are single-quoted, so escape the delimiter `'`, plus `&`/`<`/`>`.
// Double quotes (used in JSON values) are left untouched for readability.
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function blockToAnnotatedMd(
  editor: any,
  block: any,
  indent: number,
): string {
  const pad = "  ".repeat(indent);
  const id = typeof block.id === "string" ? block.id : "";
  const type = typeof block.type === "string" ? block.type : "";
  const props = compactProps(block.props);
  const propsAttr = props ? ` props='${escapeXmlAttr(JSON.stringify(props))}'` : "";

  let md = "";
  try {
    md = editor
      .blocksToMarkdownLossy([{ ...block, children: [] }])
      .trim();
  } catch {
    md = "";
  }

  const openTag = `<block id="${escapeXmlAttr(id)}" type="${escapeXmlAttr(type)}"${propsAttr}>`;
  const children: any[] = Array.isArray(block.children) ? block.children : [];

  if (children.length === 0) {
    return `${pad}${openTag}${md}</block>`;
  }
  const childParts = children.map((c) =>
    blockToAnnotatedMd(editor, c, indent + 1),
  );
  return `${pad}${openTag}\n${md}\n${childParts.join("\n")}\n${pad}</block>`;
}

export async function documentToAnnotatedMarkdown(
  blocks: any[],
): Promise<string> {
  if (!blocks || blocks.length === 0) return "";
  return withJsdomLock(async () => {
    const editor = await getEditor();
    return blocks
      .map((b) => blockToAnnotatedMd(editor, b, 0))
      .join("\n\n");
  });
}

// ── Input resolution (markdown OR JSON block) ──────────────────────────────
// Tools accept either a markdown string (converted via the editor) or a
// JSON block object (used as-is). New blocks get fresh ids.

export async function resolveBlockInput(
  input: string | Record<string, unknown>,
): Promise<any> {
  if (typeof input === "string") {
    const blocks = await markdownToBlocks(input);
    if (!blocks || blocks.length === 0) {
      throw new Error("Markdown input produced no blocks.");
    }
    return blocks[0];
  }
  const block = input as any;
  if (!block.id) block.id = generateBlockId();
  return block;
}

export async function resolveBlocksInput(
  input: string | any[],
): Promise<any[]> {
  if (typeof input === "string") {
    const blocks = await markdownToBlocks(input);
    if (!blocks || blocks.length === 0) {
      throw new Error("Markdown input produced no blocks.");
    }
    return blocks;
  }
  if (!Array.isArray(input)) {
    throw new Error("Block input must be a markdown string or an array of block objects.");
  }
  return input.map((b: any) => (b.id ? b : { ...b, id: generateBlockId() }));
}
