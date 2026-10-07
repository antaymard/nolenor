import {
  createFunctionHandle,
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionVisibility,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server";
import type { ComponentApi } from "../components/debouncer/_generated/component";

/**
 * Client du composant local `debouncer` (convex/components/debouncer).
 *
 * Une instance = une fonction cible + sa politique de debounce. La clé
 * identifie ce qu'on regroupe (un nodeData, un canvas, un user…) :
 *
 * ```ts
 * const reindex = new Debouncer(
 *   components.debouncer,
 *   internal.monModule.recalculer,
 *   { delay: 10 * SECOND, maxWait: 2 * MINUTE },
 * );
 *
 * // dans une mutation (ou une action)
 * await reindex.schedule(ctx, nodeDataId, { nodeDataId });
 * ```
 *
 * Les appels passent par le composant dans la transaction de l'appelant : si
 * la mutation appelante échoue, le debounce est annulé avec elle.
 */

export type DebounceMode = "sliding" | "fixed" | "eager";

export interface DebounceOptions {
  /** ms. En eager : durée du cooldown après chaque exécution. */
  delay: number;
  /**
   * - `sliding` (défaut) : exécute après `delay` sans nouvel appel.
   * - `fixed` : exécute `delay` après le PREMIER appel de la fenêtre.
   * - `eager` : exécute tout de suite, puis au plus une fois par `delay`
   *   (exécution traînante avec les derniers args si des appels sont arrivés).
   *
   * Le mode d'une fenêtre est figé par l'appel qui l'ouvre.
   */
  mode?: DebounceMode;
  /**
   * sliding uniquement : attente maximale depuis le premier appel de la
   * fenêtre, pour qu'un flux continu finisse quand même par s'exécuter.
   */
  maxWait?: number;
}

export interface DebouncerConfig extends DebounceOptions {
  /** Défaut : le nom de la fonction cible (`module:fonction`). */
  namespace?: string;
}

export interface DebounceScheduleResult {
  /** true si l'appel a été exécuté immédiatement (premier appel eager). */
  executedNow: boolean;
  /** Échéance de la fenêtre (exécution, ou fin du cooldown en eager). */
  runAt: number;
}

export interface DebounceStatus {
  mode: DebounceMode;
  /** Une exécution aura lieu à `runAt`. Faux pendant un cooldown eager vide. */
  pending: boolean;
  runAt: number;
  /** Appels absorbés par la fenêtre courante. */
  calls: number;
  functionName: string;
}

type Target = FunctionReference<"mutation" | "action", FunctionVisibility>;

// Contextes minimaux : le debouncer est utilisable depuis une mutation comme
// depuis une action (schedule/cancel/flush), et depuis une query (status).
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};
type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

export class Debouncer<Fn extends Target> {
  // Champs déclarés explicitement, et non en propriétés de paramètres du
  // constructeur : l'app type-checke ce fichier (via `_generated/api.d.ts`)
  // avec `erasableSyntaxOnly`, qui les refuse.
  private readonly component: ComponentApi;
  private readonly fn: Fn;
  private readonly config: DebouncerConfig;
  private readonly namespace: string;
  private readonly functionName: string;
  // Le handle ne dépend que du chemin de la fonction : on le garde pour les
  // appels suivants dans le même isolate (string, jamais une Promise, qui ne
  // peut pas traverser les requêtes).
  private functionHandle: string | undefined;

  constructor(component: ComponentApi, fn: Fn, config: DebouncerConfig) {
    this.component = component;
    this.fn = fn;
    this.config = config;
    assertDurations(config);
    this.functionName = getFunctionName(fn);
    this.namespace = config.namespace ?? this.functionName;
  }

  /**
   * Programme (ou regroupe) l'exécution de la fonction cible pour `key`. Les
   * args du dernier appel gagnent. `overrides` ne s'applique qu'à une
   * fenêtre ouverte par cet appel, sauf `delay` qui repousse aussi une
   * fenêtre sliding en cours.
   */
  async schedule(
    ctx: RunMutationCtx,
    key: string,
    args: FunctionArgs<Fn>,
    overrides?: Partial<DebounceOptions>,
  ): Promise<DebounceScheduleResult> {
    const options = { ...this.config, ...overrides };
    if (overrides) assertDurations(options);
    this.functionHandle ??= await createFunctionHandle(this.fn);
    return await ctx.runMutation(this.component.lib.schedule, {
      namespace: this.namespace,
      key,
      mode: options.mode ?? "sliding",
      delay: options.delay,
      maxWait: options.maxWait,
      functionHandle: this.functionHandle,
      functionName: this.functionName,
      functionArgs: args,
    });
  }

  /** Annule l'exécution en attente. true si une exécution a été annulée. */
  async cancel(ctx: RunMutationCtx, key: string): Promise<boolean> {
    return await ctx.runMutation(this.component.lib.cancel, {
      namespace: this.namespace,
      key,
    });
  }

  /** Exécute maintenant l'appel en attente. true si une exécution a eu lieu. */
  async flush(ctx: RunMutationCtx, key: string): Promise<boolean> {
    return await ctx.runMutation(this.component.lib.flush, {
      namespace: this.namespace,
      key,
    });
  }

  /** null si aucune fenêtre n'est ouverte pour `key`. */
  async status(ctx: RunQueryCtx, key: string): Promise<DebounceStatus | null> {
    return await ctx.runQuery(this.component.lib.status, {
      namespace: this.namespace,
      key,
    });
  }
}

function assertDurations({ delay, maxWait }: DebounceOptions): void {
  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error(`[debouncer] delay invalide : ${delay}`);
  }
  if (
    maxWait !== undefined &&
    !(Number.isFinite(maxWait) && maxWait >= delay)
  ) {
    throw new Error(`[debouncer] maxWait doit être >= delay (${maxWait})`);
  }
}
