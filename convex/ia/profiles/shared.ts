import { internal } from "../../_generated/api";
import type {
  CompactionSettings,
  Profile,
  RunInfo,
} from "../../harness/types";
import { escapeXmlAttribute } from "../../lib/xml";
import {
  chatModelOptions,
  chatModelValues,
  defaultChatModelValue,
  getChatModel,
  type ChatModelValues,
} from "../agents";
import { agentToolRegistry } from "../tools";

/**
 * Ce que les profils de l'app (Nolë, worker) partagent : choix du modèle,
 * politique de replay des tools, tools différés, deltas du canvas,
 * compaction.
 */

/** Un modèle stocké sur une tâche peut avoir été retiré de la liste depuis. */
export function resolveModel(model: string | undefined): ChatModelValues {
  return (chatModelValues as readonly string[]).includes(model ?? "")
    ? (model as ChatModelValues)
    : defaultChatModelValue;
}

export function languageModel(run: RunInfo) {
  return getChatModel(resolveModel(run.model));
}

const replayByTool = new Map(
  agentToolRegistry.map((registration) => [
    registration.config.name,
    registration.config.replay ?? "unsafe",
  ]),
);

export const toolReplay: Profile["replay"] = (toolName) =>
  replayByTool.get(toolName) ?? "unsafe";

export const deferredToolNames = agentToolRegistry
  .filter((registration) => registration.config.deferred)
  .map((registration) => registration.config.name);

/** Fenêtre par défaut d'un modèle absent du catalogue. */
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Le format du résumé de compaction (cf. Pi), avec des nodes à la place des fichiers. */
const COMPACTION_INSTRUCTIONS = `Use exactly these sections, in the language the user writes in:

## Goal
What the user is trying to achieve, in their terms.
## Constraints & Preferences
Requirements, tone, formats, things to avoid — anything the user asked for that still applies.
## Progress
- Done: what was completed (cite node ids, e.g. "created table Q12ab (Roadmap)").
- In progress: what was being worked on when the context was summarized.
- Blocked: what failed or is waiting on the user.
## Key Decisions
Each decision with its rationale.
## Next Steps
What remains to do, in order.
## Critical Context
Facts, ids, values and findings you would need to continue without re-reading everything.

Be specific and dense. Do not list every node you touched: the app appends that list itself.`;

export const canvasCompaction: CompactionSettings = {
  contextWindow(run) {
    const model = resolveModel(run.model);
    return (
      chatModelOptions.find((option) => option.value === model)?.maxContext ??
      DEFAULT_CONTEXT_WINDOW
    );
  },
  // ~400k pour les modèles actuels : au-delà, le coût de relecture de
  // chaque step et la dégradation du « milieu » commencent à compter.
  thresholdRatio: 0.4,
  instructions: COMPACTION_INSTRUCTIONS,
  async trackedState(ctx, run) {
    return ctx.runQuery(internal.ia.helpers.threadNodeDigest.threadNodeDigest, {
      threadId: run.threadId,
    });
  },
};

/**
 * Les nodes modifiés par quelqu'un d'autre pendant le run. Au premier step,
 * le message d'ouverture porte déjà les changements depuis le message
 * précédent : le delta ne commence qu'au deuxième.
 */
export const canvasStepContext: NonNullable<Profile["stepContext"]> = async (
  ctx,
  run,
  window,
) => {
  if (window.since === null) return [];
  const changes = await ctx.runQuery(
    internal.ia.helpers.canvasChangesDuringRun.canvasChangesDuringRun,
    {
      canvasId: run.canvasId,
      threadId: run.threadId,
      runMessageId: run.runMessageId,
      since: window.since,
      until: window.until,
    },
  );
  if (changes.nodes.length === 0) return [];
  const lines = changes.nodes.map(
    (node) =>
      `<node id="${node.id}" type="${node.type}" title="${escapeXmlAttribute(node.title)}"${node.frameId ? ` frameId="${node.frameId}"` : ""}/>`,
  );
  if (changes.more > 0) {
    lines.push(`… and ${changes.more} more (use list_nodes for the rest).`);
  }
  return [
    {
      tag: "canvas_changes",
      content: [
        "Modified on the canvas by someone else since your previous step (not by you). They may or may not matter for the task; re-read a node before relying on what you read earlier.",
        ...lines,
      ].join("\n"),
    },
  ];
};
