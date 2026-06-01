/**
 * Environment bindings for the speech gateway Worker.
 *
 * Secrets are set with `wrangler secret put <NAME>` (never commit them).
 * Plain vars live in `wrangler.jsonc` under `vars`.
 */
export interface Env {
  /** Mistral API key (secret). Used server-side only — never sent to clients. */
  MISTRAL_API_KEY: string;
  /**
   * Comma-separated list of accepted client tokens (secret).
   * Give each React app its own token; rotate by adding/removing entries.
   */
  GATEWAY_TOKENS?: string;

  /** Comma-separated allowed browser origins. Use "*" to allow any (dev only). */
  ALLOWED_ORIGINS?: string;
  /** Default Mistral realtime model. */
  MISTRAL_MODEL?: string;
  /** Mistral API base URL. */
  MISTRAL_BASE_URL?: string;
  /** Default streaming delay in ms (multiple of 80 in [80, 1200], or 2400). */
  DEFAULT_DELAY_MS?: string;
  /** When "true", log raw provider events to `wrangler tail`. */
  DEBUG?: string;
}

export const DEFAULTS = {
  model: "voxtral-mini-2601",
  baseUrl: "https://api.mistral.ai",
  /** Recommended balance of latency vs accuracy per Mistral docs. */
  delayMs: 480,
  /** Mistral realtime expects raw PCM little-endian 16-bit, mono. */
  sampleRate: 16000,
  encoding: "pcm_s16le" as const,
} as const;
