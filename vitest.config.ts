import { defineConfig } from "vitest/config";

// Config dédiée aux tests Convex (convex-test). Séparée de vite.config.ts :
// les plugins du front (PWA, PostHog, Tailwind) n'ont rien à faire ici.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test", "@convex-dev/agent"] } },
  },
});
