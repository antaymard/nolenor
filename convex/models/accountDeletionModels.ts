import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { rateLimiter, USER_KEYED_RATE_LIMITS } from "../lib/rateLimits";
import * as CanvasModels from "./canvasModels";
import * as SkillModels from "./skillModels";

/**
 * Suppression de compte : démantèlement de l'authentification, puis purge des
 * données, en lots.
 *
 * Deux temps, et c'est volontaire. Le démantèlement de l'auth tient dans la
 * transaction qui répond « c'est fait » à l'utilisateur : quand la mutation
 * rend la main, le compte n'existe plus et plus aucune session ne peut se
 * rouvrir. La purge des données, elle, peut demander des dizaines de
 * transactions (un compte peut porter des milliers de nodes) : elle part en
 * tâche de fond. Dans l'ordre inverse, un échec au milieu de la purge
 * laisserait un compte encore utilisable avec la moitié de son contenu
 * détruit — le pire des deux mondes.
 */

// Taille d'un lot de suppression. Une transaction Convex est bornée en
// documents lus et écrits : la purge n'en fait qu'un par passage, puis se
// re-schedule. Volontairement bien en dessous des limites — chaque ligne
// supprimée compte aussi comme une ligne lue.
const PURGE_BATCH_SIZE = 100;

/**
 * Coupe l'accès : comptes de connexion, codes de vérification, compteurs de
 * rate limit, sessions, tokens de rafraîchissement, puis le document `users`.
 *
 * @convex-dev/auth n'expose aucune API de suppression d'utilisateur
 * (get-convex/convex-auth#59, toujours ouverte) : les tables `auth*` sont
 * les nôtres, c'est à nous de les vider. Ce qui est délégué à la lib, en
 * revanche, c'est l'invalidation des sessions — `internal.auth.store` est la
 * mutation interne qu'elle monte dans `convex/auth.ts`, et son cas
 * `invalidateSessions` détruit les sessions ET les tokens de rafraîchissement
 * qui en dépendent. Le helper `invalidateSessions` exporté par la lib fait
 * exactement le même appel, mais depuis une action : inutilisable ici, où
 * l'on veut tout dans une seule transaction.
 *
 * Restent hors de portée : les JWT déjà émis, valables jusqu'à leur
 * expiration (une heure par défaut) — aucun serveur ne les révoque, ils ne
 * sont pas relus en base. Sans document `users` ni données, ils n'ouvrent
 * plus rien ; et le client se déconnecte dans la foulée.
 */
export async function teardownAuth(
  ctx: MutationCtx,
  { userId }: { userId: Id<"users"> },
): Promise<void> {
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();

  for (const account of accounts) {
    // Codes OTP en vol (vérification d'adresse, réinitialisation de mot de
    // passe) : ils pointent sur le compte, et leur index est `accountId`.
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) {
      await ctx.db.delete(code._id);
    }

    // Compteur d'échecs de connexion. La lib le clé sur l'id du compte
    // (cf. `retrieveAccountWithCredentials`) : sans ce nettoyage, il reste une
    // ligne qui référence un compte disparu.
    const rateLimit = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", account._id))
      .unique();
    if (rateLimit) {
      await ctx.db.delete(rateLimit._id);
    }

    await ctx.db.delete(account._id);
  }

  await ctx.runMutation(internal.auth.store, {
    args: { type: "invalidateSessions", userId },
  });

  await ctx.db.delete(userId);
}

/**
 * Un lot de purge. Renvoie `true` s'il reste (probablement) du travail :
 * l'appelant se re-schedule alors, jusqu'à ce qu'un passage ne trouve plus
 * rien.
 *
 * Chaque passage ne traite qu'une seule table, celle qui a encore des lignes
 * dans l'ordre ci-dessous. Rien ne dépend de l'ordre côté correction : c'est
 * la taille des cascades qui le dicte — les canvases d'abord, parce qu'ils
 * emportent l'essentiel du volume.
 *
 * La boucle termine parce que chaque passage qui renvoie `true` a supprimé au
 * moins une ligne qu'il venait de lire.
 */
export async function purgeUserDataStep(
  ctx: MutationCtx,
  { userId }: { userId: Id<"users"> },
): Promise<boolean> {
  // ── Canvases ────────────────────────────────────────────────────────────
  // Un seul par transaction : sa cascade lit tous ses nodes, edges et
  // nodeDatas, et planifie une suppression par nodeData.
  const canvas = await ctx.db
    .query("canvases")
    .withIndex("by_creator", (q) => q.eq("creatorId", userId))
    .first();
  if (canvas) {
    // La mémoire que l'agent s'est faite du canvas. `deleteCanvasAndShares`
    // ne la connaît pas (elle ne pend qu'à `subjectId`), et elle parle de
    // l'utilisateur : elle part ici.
    await deleteSubjectMemories(ctx, { subjectId: canvas._id });
    await CanvasModels.deleteCanvasAndShares(ctx, {
      canvasId: canvas._id,
      purgeVersions: true,
    });
    return true;
  }

  // ── Partages reçus ──────────────────────────────────────────────────────
  // Les canvases d'autrui auxquels il avait accès. Le canvas ne lui
  // appartient pas : seul le droit d'accès disparaît.
  const shares = await ctx.db
    .query("shares")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH_SIZE);
  if (shares.length > 0) {
    for (const share of shares) {
      await ctx.db.delete(share._id);
    }
    return true;
  }

  // ── Templates de custom nodes ───────────────────────────────────────────
  const templates = await ctx.db
    .query("nodeTemplates")
    .withIndex("by_creator", (q) => q.eq("creatorId", userId))
    .take(PURGE_BATCH_SIZE);
  if (templates.length > 0) {
    for (const template of templates) {
      await ctx.db.delete(template._id);
    }
    return true;
  }

  // ── Skills ──────────────────────────────────────────────────────────────
  // `by_user` ne remonte que les siens : les skills système n'ont pas de
  // `userId` du tout, et restent en place.
  const skills = await ctx.db
    .query("skills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH_SIZE);
  if (skills.length > 0) {
    for (const skill of skills) {
      await SkillModels.deleteSkillCascade(ctx, { skillId: skill._id });
    }
    return true;
  }

  // ── Recipes ─────────────────────────────────────────────────────────────
  const recipes = await ctx.db
    .query("recipes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH_SIZE);
  if (recipes.length > 0) {
    for (const recipe of recipes) {
      await ctx.db.delete(recipe._id);
    }
    return true;
  }

  // ── Tokens d'API / MCP ──────────────────────────────────────────────────
  // Détruits, pas révoqués : `revokedAt` sert à garder une trace côté
  // utilisateur, et il n'y a plus d'utilisateur.
  const tokens = await ctx.db
    .query("apiTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH_SIZE);
  if (tokens.length > 0) {
    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }
    return true;
  }

  // ── Mémoires de l'agent sur l'utilisateur ───────────────────────────────
  const memories = await ctx.db
    .query("memories")
    .withIndex("by_subject_and_type", (q) => q.eq("subjectId", userId))
    .take(PURGE_BATCH_SIZE);
  if (memories.length > 0) {
    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }
    return true;
  }

  // ── Conversations ───────────────────────────────────────────────────────
  // Un thread à la fois : ses métadonnées de messages peuvent être
  // nombreuses. La ligne `threadMetadata` n'est supprimée qu'une fois son
  // thread vidé — tant qu'elle est là, le passage suivant retombe dessus et
  // reprend où il s'était arrêté.
  const thread = await ctx.db
    .query("threadMetadata")
    .withIndex("by_userId_and_agentName", (q) => q.eq("userId", userId))
    .first();
  if (thread) {
    const messages = await ctx.db
      .query("messageMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", thread.threadId))
      .take(PURGE_BATCH_SIZE);
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    if (messages.length === PURGE_BATCH_SIZE) return true;

    await ctx.db.delete(thread._id);
    return true;
  }

  // ── Usage IA ────────────────────────────────────────────────────────────
  const usageEvents = await ctx.db
    .query("aiUsageEvents")
    .withIndex("by_userId_and_day", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH_SIZE);
  if (usageEvents.length > 0) {
    for (const event of usageEvents) {
      await ctx.db.delete(event._id);
    }
    return true;
  }

  const usageDays = await ctx.db
    .query("aiUsageDaily")
    .withIndex("by_userId_and_day_and_model", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH_SIZE);
  if (usageDays.length > 0) {
    for (const day of usageDays) {
      await ctx.db.delete(day._id);
    }
    return true;
  }

  // ── Compteurs de rate limit ─────────────────────────────────────────────
  // Idempotent et borné (une ligne par limite) : pas la peine d'en faire un
  // passage à part, il tient dans celui du composant agent.
  for (const limitName of USER_KEYED_RATE_LIMITS) {
    await rateLimiter.reset(ctx, limitName, { key: userId });
  }

  // ── Composant agent ─────────────────────────────────────────────────────
  // Les threads, messages et streams vivent dans les tables du composant, hors
  // de notre schéma : seul le composant sait les parcourir. `…Async` fait une
  // page puis se re-schedule tout seul, donc un seul appel suffit — et il tombe
  // en dernier, quand plus rien de notre côté ne dépend d'un threadId.
  await ctx.runMutation(components.agent.users.deleteAllForUserIdAsync, {
    userId,
  });

  return false;
}

// Les mémoires n'ont pas d'index par sujet seul, mais `by_subject_and_type`
// commence par `subjectId` : un préfixe suffit. Le volume est borné par le
// nombre de types (`one-liner`, `memory`), d'où le `collect()`.
async function deleteSubjectMemories(
  ctx: MutationCtx,
  { subjectId }: { subjectId: Id<"canvases"> | Id<"users"> },
): Promise<void> {
  const memories = await ctx.db
    .query("memories")
    .withIndex("by_subject_and_type", (q) => q.eq("subjectId", subjectId))
    .collect();
  for (const memory of memories) {
    await ctx.db.delete(memory._id);
  }
}
