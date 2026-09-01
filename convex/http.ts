import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { hashApiToken } from "./lib/apiTokenCrypto";
import { encryptSecret } from "./lib/secretCrypto";
import { rateLimiter } from "./lib/rateLimits";
import { buildMcpServer } from "./mcp/server";
import {
  getProvider,
  isProviderId,
  oauthCallbackUrl,
} from "./config/providersConfig";
import { probeIdentity, requestToken } from "./lib/providerClient";

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

/**
 * Le garde exigeait auparavant seulement que le hostname, *s'il était présent*,
 * soit dans l'allowlist — donc n'importe quel `curl` sans `Origin` ni `Referer`
 * passait sur un endpoint non authentifié qui écrit en base. On exige
 * désormais un en-tête présent ET allowlisté.
 */
function isAllowedWishlistSource(request: Request): boolean {
  const sourceHostname = getRequestSourceHostname(request);
  return sourceHostname !== null && ALLOWED_WISHLIST_HOSTNAMES.has(sourceHostname);
}

// Assez strict pour écarter les saisies invalides, assez large pour ne pas
// refuser une adresse légitime : la vérification réelle se fait à l'envoi.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * IP de l'appelant, pour la clé de rate limiting. Convex place l'IP réelle du
 * client dans `x-forwarded-for` ; on prend le premier maillon de la chaîne.
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

function buildWishlistHeaders(request: Request, extraHeaders?: Record<string, string>) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
    ...extraHeaders,
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

  return headers;
}

function buildWishlistResponse(
  payload: Record<string, unknown>,
  request: Request,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  const headers = buildWishlistHeaders(request, extraHeaders);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

const wishlistCapture = httpAction(async (ctx, request) => {
  if (!isAllowedWishlistSource(request)) {
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

  const trimmedEmail = email?.trim() ?? "";
  if (!trimmedEmail) {
    return buildWishlistResponse(
      {
        success: false,
        message: "Missing email.",
      },
      request,
      400,
    );
  }

  if (trimmedEmail.length > 254 || !EMAIL_PATTERN.test(trimmedEmail)) {
    return buildWishlistResponse(
      { success: false, message: "Invalid email." },
      request,
      400,
    );
  }

  // Endpoint public et non authentifié : sans borne, il suffisait d'une boucle
  // pour remplir la table. La clé est l'IP, faute d'identité.
  const { ok, retryAfter } = await rateLimiter.limit(ctx, "wishlistSubscribe", {
    key: getClientIp(request),
  });
  if (!ok) {
    return buildWishlistResponse(
      {
        success: false,
        message: "Too many requests. Please try again later.",
      },
      request,
      429,
      { "Retry-After": String(Math.max(1, Math.ceil(retryAfter / 1000))) },
    );
  }

  const result = await ctx.runMutation(internal.wishlist.upsertWishlistEmail, {
    email: trimmedEmail,
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
  if (!isAllowedWishlistSource(request)) {
    return buildWishlistResponse(
      {
        success: false,
        message: "Unauthorized source.",
      },
      request,
      403,
    );
  }

  // Un 204 ne doit pas porter de corps : l'ancienne version en renvoyait un
  // (`{}`), ce qui fait tousser certains clients HTTP.
  return new Response(null, {
    status: 204,
    headers: buildWishlistHeaders(request),
  });
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


// ============================================================================
// OAUTH DES INTÉGRATIONS — retour de consentement
// ============================================================================
// Une seule route pour tous les providers : c'est l'état (`state`) qui porte
// le provider, pas le chemin. Une adresse de callback de moins à déclarer dans
// chaque console, et un routeur de moins à tenir.
//
// À ne pas confondre avec le retour d'OAuth de la CONNEXION AU PRODUIT, servi
// par `auth.addHttpRoutes` : celui-ci relie un compte tiers à un utilisateur
// déjà authentifié, et il est le seul à conserver un refresh token.

/** Retour à l'app avec un message, sans jamais quitter les origines connues. */
function oauthRedirect(
  origin: string,
  params: Record<string, string>,
): Response {
  const url = new URL("/settings/connections", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  });
}

/**
 * Échec avant d'avoir pu lire une origine de retour fiable. On ne redirige
 * pas : rediriger demanderait une destination, et la seule qu'on ait sous la
 * main à ce stade viendrait de la requête elle-même — donc de l'attaquant.
 */
function oauthDeadEnd(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

const integrationsOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const [attemptId, nonce] = state.split(".");

  if (!attemptId || !nonce) {
    return oauthDeadEnd("Invalid consent: missing state.");
  }

  // La tentative est consommée AVANT tout appel réseau : un `state` rejoué ne
  // doit pas pouvoir déclencher un second échange de code, même si le premier
  // a échoué en chemin.
  const attempt = await ctx.runMutation(
    internal.wrappers.connectionWrappers.consumeAttempt,
    { attemptId, nonce },
  );
  if (!attempt) {
    return oauthDeadEnd(
      "This consent has expired or was already used. Start again.",
    );
  }

  // À partir d'ici on connaît une origine de retour validée à la création de la
  // tentative : les erreurs peuvent redevenir des redirections lisibles.
  const origin = attempt.returnOrigin;

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return oauthRedirect(origin, { error: providerError });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return oauthRedirect(origin, { error: "missing_code" });
  }
  if (!isProviderId(attempt.provider)) {
    return oauthRedirect(origin, { error: "unknown_provider" });
  }
  const provider = getProvider(attempt.provider);

  try {
    const token = await requestToken(provider, {
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthCallbackUrl(),
      ...(attempt.codeVerifier ? { code_verifier: attempt.codeVerifier } : {}),
    });

    // Le compte est identifié AVANT l'écriture : `externalAccountId` est la
    // clé d'upsert, c'est lui qui distingue « reconnecter le même Gmail » de
    // « en relier un second ».
    const identity = await probeIdentity(provider, token.accessToken);

    await ctx.runMutation(
      internal.wrappers.connectionWrappers.upsertFromOAuth,
      {
        userId: attempt.userId,
        provider: provider.id,
        externalAccountId: identity.externalAccountId,
        label: identity.label,
        scopes: token.scopes ?? provider.auth.scopes,
        secret: await encryptSecret({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
        }),
        expiresAt: token.expiresAt,
      },
    );

    return oauthRedirect(origin, { connected: provider.id });
  } catch (error) {
    console.error("[integrations] échec du consentement", {
      provider: attempt.provider,
      detail: error instanceof Error ? error.message : String(error),
    });
    return oauthRedirect(origin, { error: "exchange_failed" });
  }
});

auth.addHttpRoutes(http);

http.route({
  path: "/integrations/oauth/callback",
  method: "GET",
  handler: integrationsOAuthCallback,
});

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
