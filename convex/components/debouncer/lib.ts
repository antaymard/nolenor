import { v } from "convex/values";
import type { FunctionHandle } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { modeValidator } from "./schema";

/**
 * Debouncer serveur : regroupe les appels rapprochés sur une même
 * (namespace, key) en une seule exécution de la fonction cible.
 *
 * - sliding : chaque appel repousse l'échéance de `delay` (plafonnée par
 *   `maxWait`). Exécution unique, avec les derniers args, après un silence.
 * - fixed : l'échéance est fixée par le premier appel ; les suivants ne font
 *   que remplacer les args.
 * - eager : exécution immédiate au premier appel, puis cooldown de `delay`.
 *   Les appels pendant le cooldown produisent UNE exécution traînante (derniers
 *   args) à sa fin, qui rouvre elle-même un cooldown (sémantique throttle).
 *
 * Différences avec convex-debouncer (ikhrustalev), dont ce composant s'inspire :
 * - sliding ne fait plus cancel + runAfter à chaque appel : seul `runAt` est
 *   patché, le timer se réarme paresseusement quand il tombe trop tôt. Un
 *   burst de N appels coûte N petits patches, pas 2N écritures scheduler.
 * - handle ET args sont remplacés ensemble (l'original gardait l'ancien
 *   handle avec les nouveaux args).
 * - garde par `generation` : un timer obsolète ne peut jamais exécuter.
 * - une fenêtre dont le timer a disparu (échec, handle invalide) est
 *   réarmée au prochain appel au lieu de bloquer la clé pour toujours.
 * - `maxWait` en sliding, `flush`, validation des délais.
 */

// Retard toléré du scheduler avant de considérer qu'un timer est perdu et de
// le réarmer. Large : un réarmement superflu est inoffensif (generation),
// mais inutile.
const STALE_TIMER_MS = 60_000;

const keyArgs = { namespace: v.string(), key: v.string() };

type Target = Pick<
  Doc<"windows">,
  "functionHandle" | "functionName" | "functionArgs"
>;

async function findWindow(
  ctx: QueryCtx,
  { namespace, key }: { namespace: string; key: string },
): Promise<Doc<"windows"> | null> {
  return await ctx.db
    .query("windows")
    .withIndex("by_namespace_and_key", (q) =>
      q.eq("namespace", namespace).eq("key", key),
    )
    .unique();
}

// Passe toujours par le scheduler, même pour une mutation : la cible tourne
// dans sa propre transaction (son échec n'annule pas l'état du debouncer) et
// les actions sont supportées de la même façon.
async function dispatch(ctx: MutationCtx, target: Target): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    target.functionHandle as FunctionHandle<"mutation" | "action">,
    target.functionArgs,
  );
}

// Arme un nouveau timer et invalide le précédent (generation + 1). `extra`
// est fusionné dans le même patch.
async function arm(
  ctx: MutationCtx,
  window: Pick<Doc<"windows">, "_id" | "generation">,
  at: number,
  extra: Partial<Doc<"windows">> = {},
): Promise<void> {
  const generation = window.generation + 1;
  const timerId = await ctx.scheduler.runAt(at, internal.lib.fire, {
    windowId: window._id,
    generation,
  });
  await ctx.db.patch("windows", window._id, { ...extra, generation, timerId });
}

async function close(ctx: MutationCtx, window: Doc<"windows">): Promise<void> {
  // Pas indispensable (generation protège déjà), mais évite un réveil inutile.
  if (window.timerId) await ctx.scheduler.cancel(window.timerId);
  await ctx.db.delete("windows", window._id);
}

function assertDuration(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`[debouncer] ${name} invalide : ${value}`);
  }
}

export const schedule = mutation({
  args: {
    ...keyArgs,
    mode: modeValidator,
    delay: v.number(),
    maxWait: v.optional(v.number()),
    functionHandle: v.string(),
    functionName: v.string(),
    functionArgs: v.any(),
  },
  returns: v.object({
    executedNow: v.boolean(),
    runAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { namespace, key, mode, delay, maxWait } = args;
    assertDuration("delay", delay);
    if (maxWait !== undefined) {
      assertDuration("maxWait", maxWait);
      if (maxWait < delay) {
        throw new Error("[debouncer] maxWait doit être >= delay");
      }
    }

    const now = Date.now();
    const target: Target = {
      functionHandle: args.functionHandle,
      functionName: args.functionName,
      functionArgs: args.functionArgs,
    };
    const existing = await findWindow(ctx, args);

    if (!existing) {
      const runAt = now + delay;
      const executedNow = mode === "eager";
      if (executedNow) await dispatch(ctx, target);

      const windowId = await ctx.db.insert("windows", {
        namespace,
        key,
        mode,
        delay,
        ...target,
        pending: !executedNow,
        runAt,
        deadline:
          mode === "sliding" && maxWait !== undefined
            ? now + maxWait
            : undefined,
        generation: 0,
        calls: 1,
      });
      await arm(ctx, { _id: windowId, generation: 0 }, runAt);
      return { executedNow, runAt };
    }

    // Fenêtre ouverte : le mode est celui de la fenêtre, pas de l'appel.
    let runAt = existing.runAt;
    if (existing.mode === "sliding") {
      runAt = Math.min(now + delay, existing.deadline ?? Infinity);
    }
    const patch = {
      ...target,
      runAt,
      pending: true,
      calls: existing.calls + 1,
    };

    if (existing.runAt + STALE_TIMER_MS < now) {
      // Le timer aurait dû passer depuis longtemps : il est perdu.
      if (existing.timerId) await ctx.scheduler.cancel(existing.timerId);
      await arm(ctx, existing, Math.max(runAt, now), patch);
    } else {
      await ctx.db.patch("windows", existing._id, patch);
    }
    return { executedNow: false, runAt };
  },
});

/** Timer d'une fenêtre. No-op si la fenêtre est fermée ou le timer obsolète. */
export const fire = internalMutation({
  args: { windowId: v.id("windows"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, { windowId, generation }) => {
    const window = await ctx.db.get("windows", windowId);
    if (!window || window.generation !== generation) return null;

    const now = Date.now();
    if (window.runAt > now) {
      // Échéance repoussée (sliding) depuis l'armement : on se réarme.
      await arm(ctx, window, window.runAt);
      return null;
    }

    if (!window.pending) {
      // Fin d'un cooldown eager sans appel traînant.
      await ctx.db.delete("windows", window._id);
      return null;
    }

    try {
      await dispatch(ctx, window);
    } catch (error) {
      // Handle invalide (fonction supprimée/renommée depuis) : on ferme la
      // fenêtre plutôt que de laisser la mutation échouer et la clé bloquée.
      console.error(
        `[debouncer] ${window.namespace}/${window.key} : impossible de planifier ${window.functionName}`,
        error,
      );
      await ctx.db.delete("windows", window._id);
      return null;
    }

    if (window.mode === "eager") {
      // L'exécution traînante ouvre un nouveau cooldown, sinon un appel
      // arrivant juste après déclencherait une exécution immédiate de plus.
      const runAt = now + window.delay;
      await arm(ctx, window, runAt, { pending: false, runAt, calls: 0 });
    } else {
      await ctx.db.delete("windows", window._id);
    }
    return null;
  },
});

/**
 * Annule l'exécution en attente et ferme la fenêtre (en eager, le cooldown
 * est aussi levé). Renvoie true si une exécution a été annulée.
 */
export const cancel = mutation({
  args: keyArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const window = await findWindow(ctx, args);
    if (!window) return false;
    await close(ctx, window);
    return window.pending;
  },
});

/**
 * Exécute immédiatement l'appel en attente (s'il y en a un) et ferme la
 * fenêtre. Renvoie true si une exécution a été déclenchée.
 */
export const flush = mutation({
  args: keyArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const window = await findWindow(ctx, args);
    if (!window) return false;
    await close(ctx, window);
    if (window.pending) await dispatch(ctx, window);
    return window.pending;
  },
});

/**
 * Retire l'exécution en attente et rend ses args, sans l'exécuter : à
 * l'appelant de faire le travail lui-même, dans sa propre transaction (ce que
 * `flush`, qui passe par le scheduler, ne permet pas). null si rien n'est en
 * attente — une fenêtre eager en cooldown est laissée intacte.
 */
export const take = mutation({
  args: keyArgs,
  returns: v.union(v.null(), v.object({ functionArgs: v.any() })),
  handler: async (ctx, args) => {
    const window = await findWindow(ctx, args);
    if (!window || !window.pending) return null;
    await close(ctx, window);
    return { functionArgs: window.functionArgs };
  },
});

export const status = query({
  args: keyArgs,
  returns: v.union(
    v.null(),
    v.object({
      mode: modeValidator,
      pending: v.boolean(),
      runAt: v.number(),
      calls: v.number(),
      functionName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const window = await findWindow(ctx, args);
    if (!window) return null;
    return {
      mode: window.mode,
      pending: window.pending,
      runAt: window.runAt,
      calls: window.calls,
      functionName: window.functionName,
    };
  },
});
