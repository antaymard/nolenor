import { defineConfig } from "vitest/config";

// Unit tests for the pure backend layers. Environments are chosen per file via
// `// @vitest-environment …`: the BlockNote document operations run in `node`,
// the XML codec needs a DOM (ProseMirror's parser) and runs in `jsdom`.
export default defineConfig({
  test: {
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
