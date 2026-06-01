/** Parse a comma-separated env list into a trimmed, non-empty array. */
export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return false; // closed by default
  if (allowed.includes("*")) return true;
  if (!origin) return false;
  return allowed.includes(origin);
}

/** CORS headers for plain HTTP responses (health, preflight). */
export function corsHeaders(
  origin: string | null,
  allowed: string[],
): Record<string, string> {
  const allowOrigin = allowed.includes("*")
    ? "*"
    : origin && allowed.includes(origin)
      ? origin
      : "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowOrigin !== "*") headers["Vary"] = "Origin";
  }
  return headers;
}
