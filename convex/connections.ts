import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";
import { enforceRateLimit } from "./lib/rateLimits";
import { resolveReturnOrigin } from "./lib/allowedOrigins";
import { pkceChallenge, randomToken } from "./lib/secretCrypto";
import { callProvider } from "./lib/providerClient";
import { connectionStatusValidator } from "./schemas/connectionsSchema";
import errors from "./config/errorsConfig";
import {
  getProvider,
  isProviderConfigured,
  isProviderId,
  oauthCallbackUrl,
  providerIds,
  readProviderCredentials,
} from "./config/providersConfig";
import * as ConnectionModels from "./models/connectionModels";
import * as OAuthAttemptModels from "./models/oauthAttemptModels";

// ── Lectures ────────────────────────────────────────────────────────────

/**
 * Les connexions de l'utilisateur. Le validator `returns` est ici une garde,
 * pas une formalité : il rend impossible qu'un champ dérivé du secret parte au
 * client par accident, aujourd'hui ou après un futur ajout au schéma. Même
 * discipline que `apiTokens.list`.
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("connections"),
      provider: v.string(),
      externalAccountId: v.string(),
      label: v.string(),
      scopes: v.array(v.string()),
      status: connectionStatusValidator,
      lastError: v.optional(v.string()),
      lastUsedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);
    const connections = await ConnectionModels.listByUser(ctx, authUserId);
    return connections.map(ConnectionModels.toPublic);
  },
});

/**
 * Catalogue des services connectables. `configured` dit si le déploiement porte
 * les identifiants OAuth du provider ; `callbackUrl` est l'adresse à déclarer
 * dans sa console — l'afficher évite l'aller-retour où l'on cherche pourquoi le
 * consentement échoue avec `redirect_uri_mismatch`.
 */
export const catalog = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      description: v.string(),
      icon: v.string(),
      scopes: v.array(v.string()),
      configured: v.boolean(),
      callbackUrl: v.optional(v.string()),
      /** Variables à poser quand `configured` est faux. */
      envNames: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    await requireAuth(ctx);

    // `oauthCallbackUrl` lève si CONVEX_SITE_URL manque : l'écran doit rester
    // affichable pour dire ce qui manque, pas tomber en erreur.
    let callbackUrl: string | undefined;
    try {
      callbackUrl = oauthCallbackUrl();
    } catch {
      callbackUrl = undefined;
    }

    return providerIds.map((id) => {
      const provider = getProvider(id);
      return {
        id: provider.id,
        label: provider.label,
        description: provider.description,
        icon: provider.icon,
        scopes: provider.auth.scopes,
        configured: isProviderConfigured(provider),
        callbackUrl,
        envNames: [...provider.auth.envNames],
      };
    });
  },
});

// ── Consentement ────────────────────────────────────────────────────────

/**
 * Démarre un consentement : rend l'URL d'autorisation, que le front va suivre.
 *
 * Mutation et non action : rien ici ne parle au réseau. On écrit une tentative
 * et on assemble une URL — autant que ce soit transactionnel, et que la
 * tentative n'existe jamais sans l'URL qui lui correspond.
 */
export const startOAuth = mutation({
  args: {
    provider: v.string(),
    /** Origine du front, pour revenir sur le domaine d'où l'on est parti. */
    returnOrigin: v.optional(v.string()),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await enforceRateLimit(ctx, "connectionOAuthStart", authUserId);

    if (!isProviderId(args.provider)) {
      throw new ConvexError(errors.CONNECTION_PROVIDER_UNKNOWN);
    }
    const provider = getProvider(args.provider);
    const credentials = readProviderCredentials(provider);
    if (!credentials) {
      throw new ConvexError(errors.CONNECTION_PROVIDER_NOT_CONFIGURED);
    }

    const nonce = randomToken(24);
    const codeVerifier = provider.auth.usePkce ? randomToken(32) : undefined;
    const returnOrigin = resolveReturnOrigin(args.returnOrigin);

    const attemptId = await OAuthAttemptModels.create(ctx, {
      userId: authUserId,
      provider: provider.id,
      nonce,
      codeVerifier,
      returnOrigin,
    });

    const url = new URL(provider.auth.authorizeUrl);
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("redirect_uri", oauthCallbackUrl());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", provider.auth.scopes.join(" "));
    // `state` porte l'id de la tentative ET le nonce : l'id seul suffirait à
    // retrouver la ligne, le nonce prouve qu'on est bien celui qui l'a créée.
    url.searchParams.set("state", `${attemptId}.${nonce}`);
    for (const [key, value] of Object.entries(
      provider.auth.authorizeParams ?? {},
    )) {
      url.searchParams.set(key, value);
    }
    if (codeVerifier) {
      url.searchParams.set("code_challenge", await pkceChallenge(codeVerifier));
      url.searchParams.set("code_challenge_method", "S256");
    }

    return { url: url.toString() };
  },
});

export const disconnect = mutation({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await ConnectionModels.remove(ctx, args.connectionId, authUserId);
    return null;
  },
});

// ── Test ────────────────────────────────────────────────────────────────

/**
 * Appelle l'endpoint d'identité du provider avec le credential stocké.
 *
 * C'est le bout de chaîne du socle : un succès prouve d'un coup que le
 * consentement a abouti, que le secret a été chiffré puis relu, que le refresh
 * fonctionne si le token avait expiré, et que l'allowlist d'hôtes laisse
 * passer les appels légitimes.
 */
export const testConnection = action({
  args: { connectionId: v.id("connections") },
  returns: v.object({ ok: v.boolean(), summary: v.string() }),
  handler: async (ctx, args): Promise<{ ok: boolean; summary: string }> => {
    const authUserId = await requireAuth(ctx);
    await enforceRateLimit(ctx, "connectionApiCall", authUserId);

    // Une action n'a pas de `ctx.db` : la vérification de propriété passe par
    // un wrapper interne, qui refuse la connexion d'un autre utilisateur.
    const connection = await ctx.runQuery(
      internal.wrappers.connectionWrappers.findOwned,
      { connectionId: args.connectionId, userId: authUserId },
    );
    if (!connection) {
      throw new ConvexError(errors.CONNECTION_NOT_FOUND);
    }
    if (!isProviderId(connection.provider)) {
      throw new ConvexError(errors.CONNECTION_PROVIDER_UNKNOWN);
    }

    const provider = getProvider(connection.provider);
    const result = await callProvider(ctx, {
      connectionId: args.connectionId,
      url: provider.identity.url,
    });

    if (!result.ok) {
      return {
        ok: false,
        summary: `${provider.label} answered HTTP ${result.status}.`,
      };
    }

    // Le compte a pu être renommé depuis la connexion.
    try {
      const identity = provider.identity.parse(result.data);
      await ctx.runMutation(
        internal.wrappers.connectionWrappers.renameConnection,
        { connectionId: args.connectionId, label: identity.label },
      );
    } catch {
      // Un renommage raté ne doit pas transformer un test réussi en échec.
    }

    return {
      ok: true,
      summary:
        provider.identity.summarize?.(result.data) ?? "Connection is working.",
    };
  },
});
