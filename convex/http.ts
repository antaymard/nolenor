import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { mcpMethodNotAllowed, mcpPost } from "./mcp/server";

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

// Serveur MCP pour assistants tiers (Claude Code, Claude Desktop…).
http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpPost,
});

http.route({
  path: "/mcp",
  method: "GET",
  handler: mcpMethodNotAllowed,
});

http.route({
  path: "/mcp",
  method: "DELETE",
  handler: mcpMethodNotAllowed,
});

export default http;
