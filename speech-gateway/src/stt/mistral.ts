import type { Env } from "../env";
import { DEFAULTS } from "../env";
import type { GatewayEvent } from "./protocol";

/**
 * Mistral Voxtral realtime transcription adapter.
 *
 * Wire protocol (confirmed against the official mistralai SDK):
 *   - WS path: /v1/audio/transcriptions/realtime?model=<model>
 *   - Auth:    Authorization: Bearer <api key>  (server-side only)
 *   - Out:     { type: "session.update", session: { audio_format, target_streaming_delay_ms } }
 *              { type: "input_audio_buffer.append", audio: "<base64 PCM16>" }
 *   - In:      session.created | session.updated | error
 *              transcription.language | transcription.segment
 *              transcription.text.delta | transcription.done
 */

export interface SttOptions {
  model: string;
  delayMs: number;
  language?: string;
  sampleRate: number;
  encoding: string;
}

/** Resolve per-session options from query params, falling back to env/defaults. */
export function resolveOptions(url: URL, env: Env): SttOptions {
  const delayRaw = url.searchParams.get("delayMs") ?? env.DEFAULT_DELAY_MS;
  return {
    model: url.searchParams.get("model") ?? env.MISTRAL_MODEL ?? DEFAULTS.model,
    delayMs: clampDelay(delayRaw ? Number(delayRaw) : DEFAULTS.delayMs),
    language: url.searchParams.get("language") ?? undefined,
    sampleRate: Number(url.searchParams.get("sampleRate")) || DEFAULTS.sampleRate,
    encoding: url.searchParams.get("encoding") ?? DEFAULTS.encoding,
  };
}

/** Mistral accepts multiples of 80 in [80, 1200], plus the standalone 2400. */
export function clampDelay(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULTS.delayMs;
  if (ms >= 1800) return 2400;
  return Math.min(1200, Math.max(80, Math.round(ms / 80) * 80));
}

export function buildRealtimeUrl(env: Env, opts: SttOptions): string {
  const base = (env.MISTRAL_BASE_URL ?? DEFAULTS.baseUrl).replace(/\/+$/, "");
  const u = new URL(base + "/v1/audio/transcriptions/realtime");
  // Cloudflare's outbound WebSocket uses fetch() with an http(s) URL + Upgrade.
  if (u.protocol === "ws:") u.protocol = "http:";
  if (u.protocol === "wss:") u.protocol = "https:";
  u.searchParams.set("model", opts.model);
  if (opts.language) u.searchParams.set("language", opts.language);
  return u.toString();
}

/** Open the upstream WebSocket to Mistral. The API key never leaves the Worker. */
export async function connectUpstream(env: Env, opts: SttOptions): Promise<WebSocket> {
  const resp = await fetch(buildRealtimeUrl(env, opts), {
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
  });
  const ws = resp.webSocket;
  if (!ws) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Mistral upstream refused (${resp.status}): ${body.slice(0, 300)}`);
  }
  ws.accept();
  return ws;
}

/** The session.update message that configures realtime transcription. */
export function buildSessionUpdate(opts: SttOptions): string {
  return JSON.stringify({
    type: "session.update",
    session: {
      audio_format: { encoding: opts.encoding, sample_rate: opts.sampleRate },
      target_streaming_delay_ms: opts.delayMs,
    },
  });
}

export function appendAudioMessage(base64: string): string {
  return JSON.stringify({ type: "input_audio_buffer.append", audio: base64 });
}

// Best-effort control messages. `append` is confirmed; flush/end follow the
// same `input_audio_buffer.*` namespace used by the SDK's flush/end classes.
export const FLUSH_MESSAGE = JSON.stringify({ type: "input_audio_buffer.flush" });
export const END_MESSAGE = JSON.stringify({ type: "input_audio_buffer.end" });

type RawEvent = Record<string, unknown> & { type?: string };

/** Map a raw Mistral realtime event to our normalized gateway event. */
export function normalizeEvent(raw: RawEvent): GatewayEvent | null {
  switch (raw.type) {
    case "transcription.text.delta":
      return { type: "delta", text: str(raw.text) };
    case "transcription.segment": {
      const seg = (isObj(raw.segment) ? raw.segment : raw) as RawEvent;
      return {
        type: "segment",
        text: str(seg.text),
        startSec: num(seg.start),
        endSec: num(seg.end),
      };
    }
    case "transcription.language":
      return { type: "language", language: str(raw.language ?? raw.audio_language) };
    case "transcription.done": {
      const text = str(raw.text);
      return text ? { type: "final", text } : { type: "final" };
    }
    case "error": {
      const err = isObj(raw.error) ? (raw.error as RawEvent) : undefined;
      return {
        type: "error",
        message: str(err?.message ?? raw.message ?? raw.error ?? "upstream_error"),
        code: optStr(err?.code ?? raw.code),
      };
    }
    default:
      return null; // session.created/updated handled by the relay; others ignored
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function optStr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
