import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    VitePWA({
      // `prompt` plutôt qu'`autoUpdate` : Cloudflare Pages ne sert que les
      // assets du déploiement courant, donc un nouveau service worker qui
      // s'active tout seul efface le précache d'un onglet dont les chunks
      // n'existent déjà plus sur le serveur. En `prompt` il attend, l'onglet
      // reste fonctionnel, et l'utilisateur bascule via le bandeau
      // (cf. src/lib/appUpdate.ts).
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "robots.txt",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Nolënor",
        short_name: "Nolënor",
        description: "Your thinking deserves a canvas",
        theme_color: "#475569",
        background_color: "#f8fafc",
        display: "standalone",
        // Allow both portrait and landscape so large tablets (e.g. Boox Max
        // 13.3) can rotate. Phones are free to stay in portrait naturally.
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
        navigateFallback: "/index.html",
        // `mjs` compte : le worker pdf.js est émis en `.mjs` (cf. le
        // `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` de
        // PdfWindow / FullscreenPdfWindow). Sans lui dans les patterns, il
        // était le seul asset du build à ne jamais entrer dans le précache, et
        // toute vue PDF partait au réseau pour le charger.
        globPatterns: ["**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  // Shadcn aliasing
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
