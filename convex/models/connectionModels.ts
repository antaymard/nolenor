import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import errors from "../config/errorsConfig";
import type { EncryptedSecret } from "../schemas/connectionsSchema";

type Ctx = QueryCtx | MutationCtx;

/**
 * Durée d'un bail de refresh. Assez longue pour couvrir l'aller-retour vers le
 * serveur de tokens, assez courte pour qu'une action tuée en plein vol ne
 * bloque pas la connexion plus d'une poignée de secondes.
 */
const REFRESH_LEASE_MS = 15_000;

/**
 * Marge avant expiration à partir de laquelle on rafraîchit. Un token qui
 * expire dans 20 s serait périmé avant que l'appel n'arrive chez le provider.
 */
export const TOKEN_EXPIRY_SKEW_MS = 60_000;

// ── Lectures ────────────────────────────────────────────────────────────

export async function listByUser(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"connections">[]> {
  const connections = await ctx.db
    .query("connections")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return connections.sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label),
  );
}

export async function findByAccount(
  ctx: Ctx,
  {
    userId,
    provider,
    externalAccountId,
  }: { userId: Id<"users">; provider: string; externalAccountId: string },
): Promise<Doc<"connections"> | null> {
  return await ctx.db
    .query("connections")
    .withIndex("by_user_and_provider_and_account", (q) =>
      q
        .eq("userId", userId)
        .eq("provider", provider)
        .eq("externalAccountId", externalAccountId),
    )
    .unique();
}

/**
 * Lecture propriétaire. Rend la même erreur qu'une connexion inexistante quand
 * elle appartient à quelqu'un d'autre : distinguer les deux cas dirait à un
 * appelant si tel id existe.
 */
export async function requireOwned(
  ctx: Ctx,
  connectionId: Id<"connections">,
  userId: Id<"users">,
): Promise<Doc<"connections">> {
  const connection = await ctx.db.get(connectionId);
  if (!connection || connection.userId !== userId) {
    throw new ConvexError(errors.CONNECTION_NOT_FOUND);
  }
  return connection;
}

// ── Écritures ───────────────────────────────────────────────────────────

/**
 * Retour de consentement : la même connexion (même compte distant) est mise à
 * jour, pas dupliquée. On réécrit le secret et les scopes — un second
 * consentement peut en avoir accordé de nouveaux — et on efface l'erreur
 * précédente : c'est exactement ce que « reconnecter » veut dire.
 */
export async function upsertFromOAuth(
  ctx: MutationCtx,
  {
    userId,
    provider,
    externalAccountId,
    label,
    scopes,
    secret,
    expiresAt,
  }: {
    userId: Id<"users">;
    provider: string;
    externalAccountId: string;
    label: string;
    scopes: string[];
    secret: EncryptedSecret;
    expiresAt?: number;
  },
): Promise<Id<"connections">> {
  const existing = await findByAccount(ctx, {
    userId,
    provider,
    externalAccountId,
  });

  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      label,
      scopes,
      secret,
      expiresAt,
      status: "active",
      lastError: undefined,
      refreshingUntil: undefined,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("connections", {
    userId,
    provider,
    externalAccountId,
    label,
    scopes,
    secret,
    expiresAt,
    status: "active",
    updatedAt: now,
  });
}

/**
 * Déconnexion = suppression de la ligne, pas un drapeau. Garder une connexion
 * « révoquée » reviendrait à conserver un secret chiffré dont plus personne ne
 * veut ; la seule bonne façon de ne pas fuiter un credential est de ne plus
 * l'avoir.
 */
export async function remove(
  ctx: MutationCtx,
  connectionId: Id<"connections">,
  userId: Id<"users">,
): Promise<void> {
  await requireOwned(ctx, connectionId, userId);
  await ctx.db.delete(connectionId);
}

/**
 * Pose le bail de refresh. Rend `false` si un autre appelant le détient encore
 * — à lui de rafraîchir, l'appelant éconduit relira la ligne.
 *
 * La transactionnalité des mutations Convex fait tout le travail : deux
 * appelants concurrents ne peuvent pas lire le même `refreshingUntil` et
 * l'écrire tous les deux.
 */
export async function claimRefresh(
  ctx: MutationCtx,
  connectionId: Id<"connections">,
): Promise<boolean> {
  const connection = await ctx.db.get(connectionId);
  if (!connection) return false;

  const now = Date.now();
  if (
    connection.refreshingUntil !== undefined &&
    connection.refreshingUntil > now
  ) {
    return false;
  }

  await ctx.db.patch(connectionId, { refreshingUntil: now + REFRESH_LEASE_MS });
  return true;
}

export async function applyRefresh(
  ctx: MutationCtx,
  {
    connectionId,
    secret,
    expiresAt,
  }: {
    connectionId: Id<"connections">;
    secret: EncryptedSecret;
    expiresAt?: number;
  },
): Promise<void> {
  await ctx.db.patch(connectionId, {
    secret,
    expiresAt,
    status: "active",
    lastError: undefined,
    refreshingUntil: undefined,
    updatedAt: Date.now(),
  });
}

/** Libère le bail sans avoir rafraîchi (échec réseau, refus du provider). */
export async function releaseRefresh(
  ctx: MutationCtx,
  connectionId: Id<"connections">,
): Promise<void> {
  const connection = await ctx.db.get(connectionId);
  if (!connection) return;
  await ctx.db.patch(connectionId, { refreshingUntil: undefined });
}

/**
 * Le provider a refusé le credential. La connexion reste en base : c'est ce
 * qui permettra à un node connecté d'afficher « reconnecter » au lieu de
 * s'évanouir avec sa donnée.
 */
export async function markNeedsReauth(
  ctx: MutationCtx,
  connectionId: Id<"connections">,
  message: string,
): Promise<void> {
  const connection = await ctx.db.get(connectionId);
  if (!connection) return;
  await ctx.db.patch(connectionId, {
    status: "needs_reauth",
    lastError: message.slice(0, 500),
    refreshingUntil: undefined,
    updatedAt: Date.now(),
  });
}

export async function touchLastUsedAt(
  ctx: MutationCtx,
  connectionId: Id<"connections">,
): Promise<void> {
  const connection = await ctx.db.get(connectionId);
  if (!connection) return;
  await ctx.db.patch(connectionId, { lastUsedAt: Date.now() });
}

/** Vue publique d'une connexion : tout sauf ce qui touche au secret. */
export function toPublic(connection: Doc<"connections">) {
  return {
    _id: connection._id,
    provider: connection.provider,
    externalAccountId: connection.externalAccountId,
    label: connection.label,
    scopes: connection.scopes,
    status: connection.status,
    lastError: connection.lastError,
    lastUsedAt: connection.lastUsedAt,
    createdAt: connection._creationTime,
    updatedAt: connection.updatedAt,
  };
}
