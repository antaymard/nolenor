import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { hashApiToken } from "./lib/apiTokenCrypto";
import { buildMcpServer } from "./mcp/server";

const http = httpRouter();

const ALLOWED_WISHLIST_HOSTNAMES = new Set([
  "nolenor.fr",
  "www.nolenor.fr",
  "nolenor.com",
  "www.nolenor.com",
]);

function getHostnameFromHeader(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getRequestSourceHostname(request: Request): string | null {
  const originHostname = getHostnameFromHeader(request.headers.get("origin"));
  if (originHostname) {
    return originHostname;
  }

  return getHostnameFromHeader(request.headers.get("referer"));
}

function buildWishlistResponse(
  payload: Record<string, unknown>,
  request: Request,
  status = 200,
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  });

  const origin = request.headers.get("origin");
  const originHostname = getHostnameFromHeader(origin);

  if (
    origin &&
    originHostname &&
    ALLOWED_WISHLIST_HOSTNAMES.has(originHostname)
  ) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

const wishlistCapture = httpAction(async (ctx, request) => {
  const sourceHostname = getRequestSourceHostname(request);

  if (sourceHostname && !ALLOWED_WISHLIST_HOSTNAMES.has(sourceHostname)) {
    return buildWishlistResponse(
      {
        success: false,
        message: "Unauthorized source.",
      },
      request,
      403,
    );
  }

  const url = new URL(request.url);
  const referralParam = url.searchParams.get("ref");
  let email = url.searchParams.get("email");

  if (!email) {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as {
        email?: string;
      } | null;
      email = body?.email ?? null;
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const value = formData.get("email");
      if (typeof value === "string") {
        email = value;
      }
    }
  }

  if (!email || !email.trim()) {
    return buildWishlistResponse(
      {
        success: false,
        message: "Missing email.",
      },
      request,
      400,
    );
  }

  const result = await ctx.runMutation(internal.wishlist.upsertWishlistEmail, {
    email,
    referral: referralParam?.trim() || undefined,
  });

  return buildWishlistResponse(
    {
      success: true,
      alreadySubscribed: result.alreadyExists,
      message: result.message,
    },
    request,
  );
});

const wishlistOptions = httpAction(async (_ctx, request) => {
  const sourceHostname = getRequestSourceHostname(request);

  if (sourceHostname && !ALLOWED_WISHLIST_HOSTNAMES.has(sourceHostname)) {
    return buildWishlistResponse(
      {
        success: false,
        message: "Unauthorized source.",
      },
      request,
      403,
    );
  }

  return buildWishlistResponse({}, request, 204);
});

// ============================================================================
// MCP — assistants tiers (Claude Code, Claude Desktop…)
// Streamable HTTP stateless : un serveur/transport neuf par requête, réponses
// JSON (pas de session ni de SSE longue durée). Auth : Bearer <API token>.
// ============================================================================

function mcpUnauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="nolenor-mcp"',
    },
  });
}

const mcpHandler = httpAction(async (ctx, request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return mcpUnauthorized(
      "Missing Bearer token. Pass a Nolênor API token in the Authorization header.",
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const tokenHash = await hashApiToken(token);
  const tokenInfo = await ctx.runQuery(internal.mcp.auth.getTokenByHash, {
    tokenHash,
  });
  if (!tokenInfo) {
    return mcpUnauthorized("Invalid or revoked API token.");
  }

  await ctx.runMutation(internal.mcp.auth.touchLastUsedAt, {
    tokenId: tokenInfo.tokenId,
  });

  const server = buildMcpServer(ctx, {
    userId: tokenInfo.userId,
    permission: tokenInfo.permission,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return await transport.handleRequest(request);
});

// En stateless, pas de stream SSE (GET) ni de session à clore (DELETE).
const mcpMethodNotAllowed = httpAction(async () => {
  return new Response(
    JSON.stringify({ error: "Method not allowed. Use POST." }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    },
  );
});

auth.addHttpRoutes(http);

http.route({
  path: "/wishlist/subscribe",
  method: "POST",
  handler: wishlistCapture,
});

http.route({
  path: "/wishlist/subscribe",
  method: "OPTIONS",
  handler: wishlistOptions,
});

// Certains clients MCP normalisent l'URL avec un slash final → deux routes.
for (const path of ["/mcp", "/mcp/"]) {
  http.route({ path, method: "POST", handler: mcpHandler });
  http.route({ path, method: "GET", handler: mcpMethodNotAllowed });
  http.route({ path, method: "DELETE", handler: mcpMethodNotAllowed });
}

export default http;
