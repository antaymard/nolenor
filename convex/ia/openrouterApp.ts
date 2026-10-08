import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Attribution OpenRouter de l'app (cf. https://openrouter.ai/docs/app-attribution).
 *
 * `HTTP-Referer` (ici `appUrl`) est l'identifiant primaire : sans lui, aucune
 * page d'app n'est créée et l'usage n'apparaît pas dans les rankings.
 * `X-OpenRouter-Title` (ici `appName`) est le nom d'affichage.
 *
 * Point de passage unique côté AI SDK : tout modèle chat/completion doit venir
 * d'ici (via `convex/ia/agents.ts`), jamais du singleton `openrouter` sans
 * attribution. Pour les `fetch` bruts (images, transcription, Jev), utiliser
 * `openRouterAttributionHeaders()`.
 */
export const OPENROUTER_APP_NAME = "Nolënor";
export const OPENROUTER_APP_URL = "https://app.nolenor.com";

export const openrouterAttributed = createOpenRouter({
  appName: OPENROUTER_APP_NAME,
  appUrl: OPENROUTER_APP_URL,
});

/** Headers d'attribution pour les appels `fetch` directs vers OpenRouter. */
export function openRouterAttributionHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": OPENROUTER_APP_URL,
    "X-OpenRouter-Title": OPENROUTER_APP_NAME,
  };
}
