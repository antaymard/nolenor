// ============================================================================
// CLIENT D'APPEL CRÉDITÉ
// ============================================================================
// Le seul chemin par lequel un credential de connexion touche le réseau.
// Personne d'autre ne déchiffre : ni le front, ni l'agent, ni un node.
//
// C'est la graine du broker décrit dans SPECS/connected-nodes.md §2.4 — celui
// qui permettra plus tard à l'app node et au code généré par l'IA d'appeler des
// API privées en ne manipulant qu'un `connectionId` opaque. Les gardes qui
// comptent (allowlist d'hôtes, refus des redirections, plafond de réponse) sont
// posées ici dès maintenant, pendant que la surface est petite.

import { ConvexError } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import errors from "../config/errorsConfig";
import {
  getProvider,
  isAllowedApiHost,
  isProviderId,
  readProviderCredentials,
  type ProviderConfig,
} from "../config/providersConfig";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { TOKEN_EXPIRY_SKEW_MS } from "../models/connectionModels";

/** Ce que porte le secret chiffré d'une connexion OAuth. */
type OAuthSecret = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
};

/** Réponse d'un serveur de tokens, avant validation. */
type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
};

/** Plafond de lecture d'une réponse. Une action Convex n'est pas un proxy. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Attentes successives quand le bail de refresh est tenu par quelqu'un d'autre. */
const REFRESH_WAIT_MS = 400;
const REFRESH_WAIT_ATTEMPTS = 3;

// ── Échange de code / refresh ───────────────────────────────────────────

function readTokenResponse(json: unknown): TokenResponse {
  return typeof json === "object" && json !== null
    ? (json as TokenResponse)
    : {};
}

/**
 * Appelle le serveur de tokens d'un provider. Sert les deux échanges :
 * `authorization_code` au retour du consentement, `refresh_token` ensuite.
 */
export async function requestToken(
  provider: ProviderConfig,
  params: Record<string, string>,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}> {
  const credentials = readProviderCredentials(provider);
  if (!credentials) {
    throw new ConvexError(errors.CONNECTION_PROVIDER_NOT_CONFIGURED);
  }

  const body = new URLSearchParams({
    ...params,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });

  const response = await fetch(provider.auth.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // GitHub rend du form-urlencoded par défaut, y compris pour ses erreurs.
      ...(provider.auth.tokenAcceptJson ? { Accept: "application/json" } : {}),
    },
    body: body.toString(),
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Unreadable response from the ${provider.id} token endpoint (${response.status}).`,
    );
  }

  const parsed = readTokenResponse(json);
  if (typeof parsed.error === "string") {
    const detail =
      typeof parsed.error_description === "string"
        ? `${parsed.error}: ${parsed.error_description}`
        : parsed.error;
    throw new Error(
      `${provider.label} rejected the token exchange — ${detail}`,
    );
  }
  if (typeof parsed.access_token !== "string") {
    throw new Error(
      `Unexpected response from the ${provider.id} token endpoint (${response.status}).`,
    );
  }

  return {
    accessToken: parsed.access_token,
    refreshToken:
      typeof parsed.refresh_token === "string"
        ? parsed.refresh_token
        : undefined,
    expiresAt:
      typeof parsed.expires_in === "number"
        ? Date.now() + parsed.expires_in * 1000
        : undefined,
    scopes:
      typeof parsed.scope === "string"
        ? parsed.scope.split(/[ ,]+/).filter(Boolean)
        : undefined,
  };
}

/**
 * Identifie le compte à qui appartient un token tout juste obtenu, AVANT
 * qu'une connexion existe en base.
 *
 * Cet ordre n'est pas cosmétique : `externalAccountId` est la clé d'upsert, et
 * sans lui on ne saurait pas si ce consentement reconnecte un compte déjà relié
 * ou en ajoute un second. Écrire d'abord et corriger ensuite créerait, le temps
 * d'un appel réseau, une ligne dont la clé est fausse.
 *
 * Même garde d'hôte que `callProvider` : l'URL vient du registre, mais elle
 * repasse par l'allowlist — une entrée de registre mal relue ne doit pas
 * pouvoir envoyer un token ailleurs.
 */
export async function probeIdentity(
  provider: ProviderConfig,
  accessToken: string,
): Promise<{ externalAccountId: string; label: string }> {
  const target = new URL(provider.identity.url);
  if (
    target.protocol !== "https:" ||
    !isAllowedApiHost(provider, target.hostname)
  ) {
    throw new Error(
      `The ${provider.id} identity endpoint falls outside its own allowlist.`,
    );
  }

  const response = await fetch(target.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "nolenor",
    },
    redirect: "manual",
  });
  if (!response.ok) {
    throw new Error(
      `${provider.label} rejected the identity call (HTTP ${response.status}).`,
    );
  }

  const text = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  return provider.identity.parse(JSON.parse(text));
}

// ── Access token courant ────────────────────────────────────────────────

function isExpired(connection: Doc<"connections">): boolean {
  if (connection.expiresAt === undefined) return false;
  return connection.expiresAt - TOKEN_EXPIRY_SKEW_MS <= Date.now();
}

async function refreshConnection(
  ctx: ActionCtx,
  connection: Doc<"connections">,
  provider: ProviderConfig,
  secret: OAuthSecret,
): Promise<string> {
  if (!secret.refreshToken) {
    // Sans refresh token il n'y a rien à tenter : seul un nouveau consentement
    // peut relancer la connexion.
    await ctx.runMutation(
      internal.wrappers.connectionWrappers.markNeedsReauth,
      {
        connectionId: connection._id,
        message:
          "The access token expired and this connection has no refresh token. Reconnect the account.",
      },
    );
    throw new ConvexError(errors.CONNECTION_NEEDS_REAUTH);
  }

  try {
    const refreshed = await requestToken(provider, {
      grant_type: "refresh_token",
      refresh_token: secret.refreshToken,
    });

    await ctx.runMutation(internal.wrappers.connectionWrappers.applyRefresh, {
      connectionId: connection._id,
      secret: await encryptSecret({
        accessToken: refreshed.accessToken,
        // Google ne renvoie pas de refresh token à chaque refresh : écraser
        // avec `undefined` condamnerait la connexion au prochain cycle.
        refreshToken: refreshed.refreshToken ?? secret.refreshToken,
        tokenType: secret.tokenType,
      } satisfies OAuthSecret),
      expiresAt: refreshed.expiresAt,
    });

    return refreshed.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(
      internal.wrappers.connectionWrappers.markNeedsReauth,
      { connectionId: connection._id, message },
    );
    throw new ConvexError(errors.CONNECTION_NEEDS_REAUTH);
  }
}

/**
 * Rend un access token utilisable, en rafraîchissant si nécessaire.
 *
 * Le bail (`claimRefresh`) évite le troupeau : dix nodes qui se réveillent
 * ensemble ne déclenchent qu'un refresh. Les éconduits attendent brièvement
 * puis relisent la ligne — celui qui tenait le bail l'aura mise à jour.
 */
export async function getAccessToken(
  ctx: ActionCtx,
  connectionId: Id<"connections">,
): Promise<{ token: string; provider: ProviderConfig }> {
  let connection = await ctx.runQuery(
    internal.wrappers.connectionWrappers.readConnection,
    { connectionId },
  );
  if (!connection) throw new ConvexError(errors.CONNECTION_NOT_FOUND);
  if (!isProviderId(connection.provider)) {
    throw new ConvexError(errors.CONNECTION_PROVIDER_NOT_CONFIGURED);
  }
  const provider = getProvider(connection.provider);

  if (connection.status === "needs_reauth") {
    throw new ConvexError(errors.CONNECTION_NEEDS_REAUTH);
  }

  let secret = await decryptSecret<OAuthSecret>(connection.secret);
  if (!isExpired(connection)) {
    return { token: secret.accessToken, provider };
  }

  for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt++) {
    const claimed = await ctx.runMutation(
      internal.wrappers.connectionWrappers.claimRefresh,
      { connectionId },
    );

    if (claimed) {
      try {
        const token = await refreshConnection(
          ctx,
          connection,
          provider,
          secret,
        );
        return { token, provider };
      } finally {
        // `applyRefresh` libère déjà le bail ; ceci ne rattrape que les sorties
        // par exception, pour ne pas bloquer la connexion 15 s de plus.
        await ctx.runMutation(
          internal.wrappers.connectionWrappers.releaseRefresh,
          { connectionId },
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_MS));

    const reread = await ctx.runQuery(
      internal.wrappers.connectionWrappers.readConnection,
      { connectionId },
    );
    if (!reread) throw new ConvexError(errors.CONNECTION_NOT_FOUND);
    connection = reread;
    if (connection.status === "needs_reauth") {
      throw new ConvexError(errors.CONNECTION_NEEDS_REAUTH);
    }
    secret = await decryptSecret<OAuthSecret>(connection.secret);
    if (!isExpired(connection)) {
      return { token: secret.accessToken, provider };
    }
  }

  throw new ConvexError(errors.CONNECTION_REFRESH_BUSY);
}

// ── Appel proxifié ──────────────────────────────────────────────────────

export type ProviderCallResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

/**
 * Exécute une requête sur l'API d'un provider avec le credential de la
 * connexion, injecté ici et nulle part ailleurs.
 *
 * Trois gardes, et elles ne sont pas décoratives :
 *  - l'URL doit viser un hôte de l'allowlist du provider, sinon `callProvider`
 *    devient un proxy SSRF authentifié — avec, en prime, un token attaché ;
 *  - `redirect: "manual"`, parce qu'un 302 vers un autre hôte contournerait
 *    l'allowlist en emportant l'en-tête Authorization ;
 *  - la réponse est plafonnée : une action n'a pas à ramener 200 Mo en mémoire.
 */
export async function callProvider(
  ctx: ActionCtx,
  {
    connectionId,
    url,
    method = "GET",
    headers = {},
    body,
  }: {
    connectionId: Id<"connections">;
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<ProviderCallResult> {
  const { token, provider } = await getAccessToken(ctx, connectionId);

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new ConvexError(errors.CONNECTION_HOST_NOT_ALLOWED);
  }
  if (target.protocol !== "https:") {
    throw new ConvexError(errors.CONNECTION_HOST_NOT_ALLOWED);
  }
  if (!isAllowedApiHost(provider, target.hostname)) {
    throw new ConvexError(errors.CONNECTION_HOST_NOT_ALLOWED);
  }

  const response = await fetch(target.toString(), {
    method,
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
      Accept: headers.Accept ?? "application/json",
      // GitHub exige un User-Agent et le refuse silencieusement sinon.
      "User-Agent": "nolenor",
    },
    body,
    redirect: "manual",
  });

  if (response.status === 401 || response.status === 403) {
    // Le credential a été révoqué chez le provider pendant qu'on l'avait en
    // base : la connexion doit basculer en `needs_reauth` plutôt que de rendre
    // une erreur opaque à chaque appel suivant.
    await ctx.runMutation(
      internal.wrappers.connectionWrappers.markNeedsReauth,
      {
        connectionId,
        message: `${provider.label} rejected the call (HTTP ${response.status}).`,
      },
    );
    throw new ConvexError(errors.CONNECTION_NEEDS_REAUTH);
  }

  const text = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  await ctx.runMutation(internal.wrappers.connectionWrappers.touchLastUsedAt, {
    connectionId,
  });

  return { ok: response.ok, status: response.status, data };
}
