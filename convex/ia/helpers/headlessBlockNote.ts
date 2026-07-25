// Headless BlockNote runtime: jsdom bootstrap + global swap + concurrency lock.
//
// BlockNote's markdown APIs go through ProseMirror's DOMParser, which reads
// `globalThis.document`. Convex actions have no DOM, so we run them against a
// jsdom window that is installed on `globalThis` for the duration of the call
// and restored afterwards. Because that swap is process-global, every call is
// serialized behind `jsdomLock`.
//
// This module is deliberately the ONLY place that touches jsdom and loads
// `@blocknote/core`. The codec in `blockNoteMarkdown.ts` receives an editor as
// a parameter, which keeps it free of hidden runtime magic and lets the tests
// drive it with a normally-imported editor under vitest's jsdom environment.
//
// esbuild cannot trace `globalThis.require()` / dynamic `import()`, so the
// packages are declared in `_externalDeps.ts` + `convex.json` `externalPackages`
// to make the Convex CLI install them at deploy time.

/**
 * The slice of the BlockNote editor API the codec actually uses. Typing it
 * explicitly is what lets `blockNoteMarkdown.ts` avoid `any` throughout.
 */
export interface HeadlessBlockNoteEditor {
  blocksToMarkdownLossy(blocks: unknown[]): string;
  tryParseMarkdownToBlocks(markdown: string): unknown[] | null;
}

export type DomGlobals = { document: Document; window: Window & typeof globalThis };

type GlobalWithDom = { document?: Document; window?: Window };

let domPromise: Promise<DomGlobals> | null = null;
let editorPromise: Promise<HeadlessBlockNoteEditor> | null = null;
let jsdomLock: Promise<void> = Promise.resolve();

/* eslint-disable @typescript-eslint/no-explicit-any */
function hiddenRequire(name: string): any {
  const g = globalThis as { require?: (m: string) => any };
  if (!g.require) {
    throw new Error(
      `Cannot load ${name}: require() is not available. Ensure this runs in a "use node" action.`,
    );
  }
  return g.require(name);
}

// Indirection on purpose — do NOT inline into `import("@blocknote/core")`.
// `convex.json` marks the package external for the NODE bundle only; a
// statically analysable import here would drag it into the V8 bundle too, via
// the chain `mcp/registry.ts → ia/tools/index.ts → blockNoteMarkdown.ts`.
async function hiddenImport(specifier: string): Promise<any> {
  return import(specifier);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function getDom(): Promise<DomGlobals> {
  domPromise ??= (async () => {
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

function getEditor(): Promise<HeadlessBlockNoteEditor> {
  editorPromise ??= (async () => {
    const mod = await hiddenImport("@blocknote/core");
    return mod.BlockNoteEditor.create() as HeadlessBlockNoteEditor;
  })();
  return editorPromise;
}

/**
 * Run `fn` with the jsdom globals installed, one caller at a time. The previous
 * `document`/`window` are always restored and the lock always released, even if
 * `fn` throws.
 */
export async function withHeadlessEditor<T>(
  fn: (editor: HeadlessBlockNoteEditor, dom: DomGlobals) => T | Promise<T>,
): Promise<T> {
  const previous = jsdomLock;
  let release!: () => void;
  jsdomLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  const g = globalThis as GlobalWithDom;
  const savedDoc = g.document;
  const savedWin = g.window;
  try {
    const dom = await getDom();
    g.document = dom.document;
    g.window = dom.window;
    return await fn(await getEditor(), dom);
  } finally {
    g.document = savedDoc;
    g.window = savedWin;
    release();
  }
}
