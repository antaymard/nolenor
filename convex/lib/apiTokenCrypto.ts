const TOKEN_PREFIX = "nlnr_";
const SECRET_BYTE_LENGTH = 32;
const DISPLAY_SECRET_CHARS = 8;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function generateApiToken(): string {
  const bytes = new Uint8Array(SECRET_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return `${TOKEN_PREFIX}${toBase64Url(bytes)}`;
}

export function getDisplayPrefix(fullToken: string): string {
  return fullToken.slice(0, TOKEN_PREFIX.length + DISPLAY_SECRET_CHARS);
}

export async function hashApiToken(fullToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fullToken),
  );
  return toHex(new Uint8Array(digest));
}
