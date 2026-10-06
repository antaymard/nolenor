import {
  docsToModelMessages,
  filterOutOrphanedToolMessages,
  saveMessages,
  type MessageDoc,
} from "@convex-dev/agent";
import type { ModelMessage, ToolResultPart } from "ai";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";

/**
 * Le transcript d'un run, vu par la harness. Seul fichier du kernel qui lit ou
 * écrit les messages du composant agent.
 *
 * Deux contraintes du composant (vérifiées par convex/harness/phase0.spike.test.ts)
 * fondent ce qui suit :
 * - un message `user` ouvre toujours un nouvel `order`. Un steer déplace donc
 *   la position de sauvegarde du run (`promptMessageId`), et le contexte ne
 *   peut plus se limiter à « l'order du prompt » ;
 * - sans contextHandler, la lib ne prend que les 100 derniers messages : au-delà,
 *   le message d'ouverture sort de la fenêtre et le contexte se désordonne (R14).
 *
 * D'où `assembleRunContext`, branché comme contextHandler sur chaque
 * génération.
 */

/** Messages d'historique gardés autour du run, comme la fenêtre par défaut de la lib. */
const HISTORY_MESSAGES = 100;
/** Borne de lecture : au-delà, le run lui-même est tronqué par le haut. */
const MAX_MESSAGES = 2000;
const PAGE_SIZE = 200;

/**
 * Le contexte d'une génération : tout le run (quelle que soit sa longueur),
 * complété par l'historique qui le précède jusqu'à `HISTORY_MESSAGES` au
 * total — exactement la fenêtre de la lib tant que le run y tient. Le message
 * d'ouverture est remplacé par son `llmPrompt`, les tool calls sans résultat
 * sont retirés (la lib fait de même).
 */
export async function assembleRunContext(
  ctx: Pick<ActionCtx, "runQuery">,
  run: {
    threadId: string;
    promptMessageId: string;
    runMessageId: string;
    llmPrompt: string;
    /**
     * Les `<system_update>` du run : chacun juste avant la réponse de sa
     * génération (`beforeMessageId`), celui du step en cours (`null`) à la
     * fin. Ceux des runs précédents ne sont jamais passés : ils n'existent
     * plus pour le modèle.
     */
    updates?: { beforeMessageId: string | null; content: string }[];
  },
): Promise<ModelMessage[]> {
  const newestFirst: MessageDoc[] = [];
  let cursor: string | null = null;
  let runIndex = -1;
  while (newestFirst.length < MAX_MESSAGES) {
    const page: { page: MessageDoc[]; isDone: boolean; continueCursor: string } =
      await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
        threadId: run.threadId,
        order: "desc",
        statuses: ["success"],
        upToAndIncludingMessageId: run.promptMessageId,
        paginationOpts: { cursor, numItems: PAGE_SIZE },
      });
    for (const doc of page.page) {
      if (doc._id === run.runMessageId) runIndex = newestFirst.length;
      newestFirst.push(doc);
    }
    const enough =
      runIndex !== -1 && newestFirst.length >= HISTORY_MESSAGES;
    if (enough || page.isDone) break;
    cursor = page.continueCursor;
  }

  const keep = Math.max(HISTORY_MESSAGES, runIndex + 1);
  const window = newestFirst
    .slice(0, keep)
    .reverse()
    .map((doc) =>
      doc._id === run.runMessageId
        ? { ...doc, message: { role: "user" as const, content: run.llmPrompt } }
        : doc,
    );
  return withUpdates(filterOutOrphanedToolMessages(window), run.updates ?? []);
}

/**
 * Intercale les deltas dans le contexte. Un delta est un message `user` du
 * contexte seulement, jamais du transcript : un message `user` sauvé ouvrirait
 * un nouvel order, et l'UI devrait le cacher.
 */
function withUpdates(
  docs: MessageDoc[],
  updates: { beforeMessageId: string | null; content: string }[],
): ModelMessage[] {
  const before = new Map<string, string>();
  const atEnd: string[] = [];
  for (const update of updates) {
    if (update.beforeMessageId === null) atEnd.push(update.content);
    else before.set(update.beforeMessageId, update.content);
  }

  const out: ModelMessage[] = [];
  let segment: MessageDoc[] = [];
  for (const doc of docs) {
    const update = before.get(doc._id);
    if (update !== undefined) {
      out.push(...docsToModelMessages(segment), asUpdate(update));
      segment = [];
    }
    segment.push(doc);
  }
  out.push(...docsToModelMessages(segment), ...atEnd.map(asUpdate));
  return out;
}

function asUpdate(content: string): ModelMessage {
  return { role: "user", content };
}

export type ToolResultOutput = ToolResultPart["output"];

/**
 * Écrit le résultat d'un tool call dans le transcript, à la position du run.
 * Appelée depuis la mutation qui termine la tâche tool : résultat et état
 * terminal sont écrits ensemble, ou pas du tout (R20).
 */
export async function saveToolResult(
  ctx: MutationCtx,
  args: {
    threadId: string;
    userId: string;
    promptMessageId: string;
    agentName: string;
    toolCallId: string;
    toolName: string;
    output: ToolResultOutput;
  },
): Promise<string> {
  const { messages } = await saveMessages(ctx, components.agent, {
    threadId: args.threadId,
    userId: args.userId,
    agentName: args.agentName,
    promptMessageId: args.promptMessageId,
    messages: [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: args.toolCallId,
            toolName: args.toolName,
            output: args.output,
          },
        ],
      },
    ],
  });
  return messages[0]._id;
}
