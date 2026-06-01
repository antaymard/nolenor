import type { Env } from "./env";
import { isOriginAllowed, parseList } from "./cors";

export interface AuthResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

/**
 * Extract the client token. Browsers can't set arbitrary headers on a
 * WebSocket, so we accept the token via (in priority order):
 *   1. `Sec-WebSocket-Protocol: bearer, <token>` subprotocol pair
 *   2. `?token=<token>` query parameter
 *   3. `Authorization: Bearer <token>` header (non-browser clients)
 */
export function extractClientToken(request: Request, url: URL): string | null {
  const proto = request.headers.get("Sec-WebSocket-Protocol");
  if (proto) {
    const parts = proto.split(",").map((p) => p.trim());
    const idx = parts.findIndex((p) => p.toLowerCase() === "bearer");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  const q = url.searchParams.get("token");
  if (q) return q;
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return null;
}

/** Length-checked, constant-time-ish compare to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authorize(request: Request, url: URL, env: Env): AuthResult {
  const allowedOrigins = parseList(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin");

  // The Origin check only applies when an Origin header is present (browsers).
  // Non-browser clients (no Origin) are gated by the token alone.
  if (origin !== null && !isOriginAllowed(origin, allowedOrigins)) {
    return { ok: false, status: 403, reason: "origin_not_allowed" };
  }

  const tokens = parseList(env.GATEWAY_TOKENS);
  if (tokens.length === 0) {
    return { ok: false, status: 500, reason: "gateway_tokens_not_configured" };
  }
  const provided = extractClientToken(request, url);
  if (!provided || !tokens.some((t) => safeEqual(t, provided))) {
    return { ok: false, status: 401, reason: "invalid_token" };
  }
  return { ok: true };
}
