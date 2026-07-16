/* eslint-disable @typescript-eslint/no-explicit-any */
// BlockNote <-> Markdown conversion for the agent layer.
//
// Mirrors plateMarkdownConverter.ts: dynamic imports dodge Convex's deploy-time
// bundling analysis (BlockNote chunks reference `document`/`window` eagerly).
// Unlike Plate (which never touches a real DOM at runtime), BlockNote's
// markdown export/parse genuinely needs a DOM — provided here by jsdom.
//
// Both jsdom and @blocknote/core are loaded via `globalThis.require` with the
// module name split so esbuild (Convex codegen) cannot statically resolve the
// import path and pull in Node built-in modules (fs, path, vm, …) that jsdom
// uses. The require call lives inside function bodies (not at module top
// level), so the V8 isolate's codegen analysis pass never executes it. At
// runtime in a `"use node"` action, `require` is available (CJS bundle).
//
// Runtime requirement: every calling action MUST run in a `"use node"` context
// (noleCompletion.ts, worker.ts, chunkBuilder.ts all do). jsdom is a real Node
// dependency and cannot run in the plain V8 isolate.

import { generateBlockId, type AnyBlock } from "./blocknoteBlockTree";

// ── jsdom globals + concurrency lock ───────────────────────────────────────
// The ProseMirror DOMParser used by `tryParseMarkdownToBlocks` reads
// `globalThis.document`. We monkeypatch it for the duration of each conversion.
// Concurrent tool calls in the same Node process would interleave incompatible
// globals, so a single in-flight mutex serializes all jsdom-touching work.

type DomGlobals = { document: Document; window: Window & typeof globalThis };

let domPromise: Promise<DomGlobals> | null = null;
let editorPromise: Promise<any> | null = null;
let jsdomLock: Promise<void> = Promise.resolve();

// Hidden require — `globalThis.require` accessed indirectly so esbuild can't
// trace it as a `require()` call, and the module name is split so the string
// literal "jsdom" / "@blocknote/core" doesn't appear in any import-like
// position. Only called at runtime (inside function bodies), never at module
// load time.
function hiddenRequire(name: string): any {
  const g = globalThis as { require?: (m: string) => any };
  if (!g.require) {
    throw new Error(
      `Cannot load ${name}: require() is not available. Ensure this runs in a "use node" action.`,
    );
  }
  return g.require(name);
}

async function getDom(): Promise<DomGlobals> {
  if (domPromise) return domPromise;
  domPromise = (async () => {
    const { JSDOM } = hiddenRequire("js" + "dom");
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
      const mod = hiddenRequire("@block" + "note/core");
      const { BlockNoteEditor } = mod;
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

// ── Annotated markdown → blocks (write-side parser) ──────────────────────
// Mirrors the read format: parses `<block type="…" props='{…}'>markdown</block>`
// back into BlockNote blocks. Gives the LLM read/write symmetry — it can copy
// a block from read_nodes output, modify the text, and send it back. Props from
// the tag override whatever the markdown parser infers, so rich formatting
// (colors, alignment, level) is preserved losslessly.

const TAG_RE = /<block\s+([^>]*?)>|<\/block>/g;

interface BlockToken {
  kind: "open" | "close";
  attrs?: string;
  start: number;
  end: number;
}

interface RawBlock {
  attrs?: string;
  tagStart: number;
  contentStart: number;
  contentEnd: number;
  children: RawBlock[];
}

function tokenize(md: string): BlockToken[] {
  const tokens: BlockToken[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(md)) !== null) {
    if (m[0] === "</block>") {
      tokens.push({ kind: "close", start: m.index, end: m.index + m[0].length });
    } else {
      tokens.push({ kind: "open", attrs: m[1], start: m.index, end: m.index + m[0].length });
    }
  }
  return tokens;
}

function buildRawTree(tokens: BlockToken[]): RawBlock[] {
  const roots: RawBlock[] = [];
  const stack: RawBlock[] = [];
  for (const tok of tokens) {
    if (tok.kind === "open") {
      const block: RawBlock = {
        attrs: tok.attrs,
        tagStart: tok.start,
        contentStart: tok.end,
        contentEnd: -1,
        children: [],
      };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(block);
      } else {
        roots.push(block);
      }
      stack.push(block);
    } else {
      const block = stack.pop();
      if (block) block.contentEnd = tok.start;
    }
  }
  return roots;
}

const ATTR_RE = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;

function unescapeXmlAttr(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseTagAttrs(attrsString: string): {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
} {
  const out: {
    id?: string;
    type?: string;
    props?: Record<string, unknown>;
  } = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrsString)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? m[2] : m[3];
    if (key === "id") out.id = val;
    else if (key === "type") out.type = val;
    else if (key === "props") {
      try {
        out.props = JSON.parse(unescapeXmlAttr(val));
      } catch {
        // ignore malformed props JSON
      }
    }
  }
  return out;
}

function extractDirectMarkdown(raw: RawBlock, md: string): string {
  if (raw.children.length === 0) {
    return md.slice(raw.contentStart, raw.contentEnd).trim();
  }
  // Content before the first child tag is the block's own markdown.
  return md.slice(raw.contentStart, raw.children[0].tagStart).trim();
}

async function rawToBlock(raw: RawBlock, md: string): Promise<AnyBlock> {
  const attrs = parseTagAttrs(raw.attrs ?? "");
  const directMd = extractDirectMarkdown(raw, md);

  let content: unknown = undefined;
  if (directMd) {
    const parsed = await markdownToBlocks(directMd);
    if (parsed && parsed.length > 0 && parsed[0].content !== undefined) {
      content = parsed[0].content;
    }
  }

  let children: AnyBlock[] | undefined = undefined;
  if (raw.children.length > 0) {
    children = await Promise.all(
      raw.children.map((c) => rawToBlock(c, md)),
    );
  }

  const block: AnyBlock = {
    id: attrs.id || generateBlockId(),
    type: attrs.type || "paragraph",
  };
  if (attrs.props) block.props = attrs.props;
  if (content !== undefined) block.content = content;
  if (children) block.children = children;
  return block;
}

export async function annotatedMarkdownToBlocks(
  md: string,
): Promise<AnyBlock[]> {
  const trimmed = md.trim();
  if (!trimmed) return [];
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return [];
  const rawBlocks = buildRawTree(tokens);
  return Promise.all(rawBlocks.map((raw) => rawToBlock(raw, trimmed)));
}

// ── Input resolution ─────────────────────────────────────────────────────
// Tools accept a string that is either annotated markdown (symmetric with the
// read format — preferred for lossless edits) or plain markdown (fallback,
// lossy). The detection is simple: if the string contains `<block` tags, parse
// as annotated markdown; otherwise, treat as plain markdown.

export async function resolveBlockInput(input: string): Promise<AnyBlock> {
  const blocks = await resolveBlocksInput(input);
  if (blocks.length === 0) {
    throw new Error("Block input produced no blocks.");
  }
  return blocks[0];
}

export async function resolveBlocksInput(input: string): Promise<AnyBlock[]> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty block input.");
  }

  // Annotated markdown (contains <block> tags) — symmetric with read format.
  if (/<block\s/.test(trimmed)) {
    return annotatedMarkdownToBlocks(trimmed);
  }

  // Plain markdown fallback.
  const blocks = await markdownToBlocks(trimmed);
  if (!blocks || blocks.length === 0) {
    throw new Error("Markdown input produced no blocks.");
  }
  return blocks;
}
