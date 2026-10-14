import { PostHog } from "@posthog/convex";
import type { Scheduler } from "convex/server";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import { isProdDeployment } from "./deployment";

/**
 * Point d'entrée unique vers PostHog côté backend, pendant de
 * `src/lib/analytics.ts` côté front.
 *
 * Rien d'autre dans `convex/` n'importe `@posthog/convex` : les erreurs
 * remontent par `reportError()`, les signaux non-erreur par `trackEvent()`.
 *
 * Deux chemins vers PostHog Error Tracking, complémentaires :
 *
 * - l'intégration « Exception reporting » du dashboard Convex voit toutes les
 *   exceptions NON rattrapées, de toutes les fonctions (queries comprises),
 *   sans contexte métier ;
 * - `reportError()` couvre ce qu'elle ne voit pas : les erreurs que le code
 *   rattrape et transforme en état (une génération rejouée puis abandonnée,
 *   un tool qui rend une erreur au modèle, un lease expiré…). C'est presque
 *   toute la harness : elle n'échoue jamais « en l'air ».
 *
 * Actif en production seulement, comme le front : dev, previews et forks
 * n'envoient rien et ne planifient rien. `POSTHOG_ENABLED` force l'un ou
 * l'autre (`true` pour tester depuis un déploiement de dev, `false` pour
 * couper en prod sans redéployer).
 *
 * Dans une mutation, la capture est planifiée (`ctx.scheduler`) et part donc
 * avec la transaction : une mutation qui throw après `reportError()` annule
 * aussi la capture. N'appeler `reportError()` dans une mutation que sur un
 * chemin qui commit (erreur rattrapée, état d'échec écrit).
 */

const posthog = new PostHog(components.posthog);

/**
 * Tout ctx Convex. Seuls ceux de mutation et d'action ont un scheduler : sans
 * (query, ou ctx réduit par son type comme celui d'un `usageHandler` de
 * l'agent, qui en porte un à l'exécution), l'erreur part en console seulement.
 */
type ObservabilityCtx = object;

function schedulerOf(ctx: ObservabilityCtx): Scheduler | undefined {
  const { scheduler } = ctx as { scheduler?: Scheduler };
  return scheduler && typeof scheduler.runAfter === "function"
    ? scheduler
    : undefined;
}

export type ErrorContext = {
  /**
   * D'où vient l'erreur, en `domaine.étape` (`harness.generation`,
   * `tool`, …). Premier filtre dans PostHog.
   */
  source: string;
  /** Même distinctId que `identifyUser()` côté front : l'`_id` du user. */
  userId?: string;
  [property: string]: unknown;
};

/** Comme `ErrorContext`, `source` en moins d'obligatoire. */
type EventContext = {
  source?: string;
  userId?: string;
  [property: string]: unknown;
};

function isEnabled(): boolean {
  const forced = process.env.POSTHOG_ENABLED?.trim().toLowerCase();
  if (forced === "true") return true;
  if (forced === "false") return false;
  return isProdDeployment();
}

/**
 * Propriétés communes à tout ce qui part du backend. `environment` sépare ce
 * qu'envoie un déploiement de dev forcé par `POSTHOG_ENABLED`.
 */
function baseProperties(): Record<string, unknown> {
  return {
    runtime: "convex",
    environment: isProdDeployment() ? "production" : "development",
  };
}

/**
 * Seul chemin de remontée d'erreur du backend. Toujours loggé en console (les
 * logs Convex en ont besoin), envoyé à PostHog quand il est actif.
 *
 * Ne throw jamais : une panne d'observabilité ne doit pas casser un run.
 */
export async function reportError(
  ctx: ObservabilityCtx,
  error: unknown,
  context: ErrorContext,
): Promise<void> {
  const { source, userId, ...properties } = context;
  console.error(`[${source}]`, describeError(error), properties);

  const scheduler = schedulerOf(ctx);
  if (!isEnabled() || !scheduler) return;
  try {
    await posthog.captureException({ scheduler }, {
      error,
      ...(userId ? { distinctId: userId } : {}),
      additionalProperties: {
        ...baseProperties(),
        source,
        ...properties,
      },
    });
  } catch (captureError) {
    console.warn("[observability] capture failed", describeError(captureError));
  }
}

/**
 * Signal non-erreur (rejeu sur 429, débordement de contexte, …) : ce qui se
 * compte et se trace en courbe plutôt que de devenir une issue.
 *
 * Ne throw jamais : cf. `reportError()`.
 */
export async function trackEvent(
  ctx: ObservabilityCtx,
  event: string,
  context: EventContext,
): Promise<void> {
  const scheduler = schedulerOf(ctx);
  if (!isEnabled() || !scheduler) return;
  const { userId, ...properties } = context;
  try {
    await posthog.capture({ scheduler }, {
      event,
      // Sans user (cron, tâche système), un id stable évite de créer une
      // personne anonyme par événement.
      distinctId: userId ?? "convex-backend",
      properties: {
        ...baseProperties(),
        ...properties,
        ...(userId ? {} : { $process_person_profile: false }),
      },
    });
  } catch (captureError) {
    console.warn("[observability] capture failed", describeError(captureError));
  }
}

/**
 * Une erreur que l'application a voulue : `ConvexError` (accès refusé, nœud
 * introuvable, entrée invalide — la convention de `models/` et `wrappers/`)
 * ou argument refusé par un validateur Convex. Dans un tool, c'est presque
 * toujours le modèle qui s'est trompé d'entrée : le modèle la lit et se
 * corrige, ce n'est pas un bug à suivre.
 */
export function isExpectedError(error: unknown): boolean {
  if (error instanceof ConvexError) return true;
  return /ArgumentValidationError/.test(describeError(error));
}

/**
 * Erreur rattrapée par un tool et rendue au modèle. Ne remonte que l'inattendu
 * (cf. `isExpectedError`) : le reste est le fonctionnement normal d'un tool.
 */
export async function reportToolError(
  ctx: ObservabilityCtx & { userId?: string; threadId?: string },
  toolName: string,
  error: unknown,
): Promise<void> {
  if (isExpectedError(error)) {
    console.warn(`[tool] ${toolName}`, describeError(error));
    return;
  }
  await reportError(ctx, error, {
    source: "tool",
    tool_name: toolName,
    // Le même tool sert la harness et le serveur MCP : seul le premier a un
    // thread.
    surface: ctx.threadId ? "agent" : "mcp",
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(ctx.threadId ? { thread_id: ctx.threadId } : {}),
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
