"use node";
// This file exists solely to make the Convex CLI detect `jsdom` and
// `@blocknote/core` as external packages that must be installed on the server.
//
// The real runtime loading happens via `globalThis.require()` in
// `blockNoteMarkdownConverter.ts` (esbuild can't trace `globalThis.require`,
// so without this file the packages wouldn't be installed at deploy time).
//
// The static `import` statements below are seen by esbuild, but since this file
// has `"use node"` and the packages are listed in `convex.json` `externalPackages`,
// esbuild marks them as external (doesn't bundle them) and the CLI installs them.
import { action } from "../../_generated/server";

import "jsdom";
import "@blocknote/core";

export const noop = action({
  args: {},
  handler: async () => {},
});
