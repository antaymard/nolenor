import path from "node:path";
import { defineConfig } from "vitest/config";

// Config dédiée aux tests Convex (convex-test) et aux règles pures du front
// (`src/**/*.test.ts`, sans DOM). Séparée de vite.config.ts : les plugins du
// front (PWA, PostHog, Tailwind) n'ont rien à faire ici.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    server: { deps: { inline: ["convex-test", "@convex-dev/agent"] } },
    // Des modules de tools instancient leur client dès l'import ; aucune
    // requête réelle n'est faite en test.
    env: { PARALLEL_API_KEY: "test", OPENROUTER_API_KEY: "test" },
  },
});
