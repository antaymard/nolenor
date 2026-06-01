/**
 * Normalized, provider-agnostic protocol between the browser and the gateway.
 *
 * Audio is sent most efficiently as raw binary PCM16 frames (ArrayBuffer).
 * A base64 JSON fallback (`{ type: "audio", data }`) exists for environments
 * that can't send binary frames.
 */

/** Messages the browser sends to the gateway. */
export type ClientMessage =
  | { type: "configure"; language?: string; model?: string; delayMs?: number }
  | { type: "audio"; data: string } // base64-encoded PCM16
  | { type: "flush" } // ask the model to emit pending text now
  | { type: "stop" }; // signal end of input

/** Events the gateway sends to the browser. */
export type GatewayEvent =
  | { type: "ready"; model: string; sampleRate: number; encoding: string }
  | { type: "language"; language: string }
  /** Incremental text to append to the current (not-yet-final) hypothesis. */
  | { type: "delta"; text: string }
  /** A timed segment; may revise the current hypothesis. */
  | { type: "segment"; text: string; startSec?: number; endSec?: number }
  /**
   * The current utterance is complete. If `text` is present it is authoritative
   * (and may differ from the accumulated deltas — i.e. a retrospective
   * correction). If absent, the client should promote its accumulated deltas.
   */
  | { type: "final"; text?: string }
  | { type: "error"; message: string; code?: string }
  | { type: "closed"; reason?: string };
