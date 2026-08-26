# PostHog Source Map Upload — Setup Report

## Files changed

| File | What changed |
|------|-------------|
| `vite.config.ts` | Added `loadEnv` import; module-level env merge; `@posthog/rollup-plugin` with `deleteAfterUpload: true`; `build.sourcemap: true` |
| `.env.local` | Added `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` |
| `package.json` / `yarn.lock` | New dev dependency: `@posthog/rollup-plugin` |

## How source maps are uploaded

`yarn build` now:
1. Generates source maps (`build.sourcemap: true`)
2. The `@posthog/rollup-plugin` injects chunk IDs into each bundle and uploads the maps to PostHog
3. Deletes the `.map` files from `dist/` after upload (`deleteAfterUpload: true`)

Source maps are only uploaded during the production build — never during `yarn dev`.

## Build & run commands

| Purpose | Command |
|---------|---------|
| Production build (uploads source maps) | `yarn build` |
| Preview production build locally | `yarn preview` |

## Credentials used at build time

| Variable | Purpose |
|----------|---------|
| `POSTHOG_API_KEY` | Personal API key — authenticates the upload |
| `POSTHOG_PROJECT_ID` | PostHog project ID (158653) |
| `POSTHOG_HOST` | PostHog API host (https://eu.posthog.com) |

**Never commit these values.** `POSTHOG_API_KEY` is already in `.gitignore` via `.env.local`.

## ⚠️ Manual step required — Cloudflare Pages

The production build runs on **Cloudflare Pages** (no config file exists in the repo to edit). You must add the three variables to your Cloudflare Pages project so source maps upload on every deploy:

1. Open your Cloudflare Pages project → **Settings → Environment variables**
2. Add the following variables under **Production** (and optionally Preview):

   | Variable | Value |
   |----------|-------|
   | `POSTHOG_API_KEY` | Your personal PostHog API key |
   | `POSTHOG_PROJECT_ID` | `158653` |
   | `POSTHOG_HOST` | `https://eu.posthog.com` |

3. Re-trigger a deploy so the next build picks them up.

Until these are added, `yarn build` on Cloudflare Pages will skip the upload (the plugin is guarded and fails silently when `POSTHOG_API_KEY` is absent).

## Verify the upload

After your next production build completes, check that a new symbol set appeared:

👉 https://eu.posthog.com/project/158653/error_tracking/configuration

You should also see `//# chunkId=…` comments in your built `.js` files (before deletion) — these allow PostHog to match stack frames to the uploaded maps.
