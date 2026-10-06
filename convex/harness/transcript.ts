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
 * génération. Plus de fenêtre en nombre de messages : l'historique est borné
 * par la compaction (cf. compaction.ts), et par un budget de tokens en filet.
 */

/** Borne de lecture : au-delà, l'historique est tronqué par le haut. */
const MAX_MESSAGES = 2000;
const PAGE_SIZE = 100;

/** La position d'un message dans le thread. */
export type MessagePosition = { order: number; stepOrder: number };

/** Ce que l'assemblage reprend de la dernière compaction du thread. */
export type CompactionView = MessagePosition & {
  firstKeptMessageId: string;
  summary: string;
};

function isBefore(doc: MessagePosition, position: MessagePosition): boolean {
  return (
    doc.order < position.order ||
    (doc.order === position.order && doc.stepOrder < position.stepOrder)
  );
}

/**
 * Estimation grossière (4 caractères par token) : sert à borner, pas à
 * facturer. Le vrai compte vient de l'usage du provider.
 */
export function estimateTokens(doc: MessageDoc): number {
  return Math.ceil(JSON.stringify(doc.message ?? "").length / 4);
}

/**
 * Les messages réussis du thread jusqu'à `upToMessageId` (son order compris),
 * du plus récent au plus ancien, sans remonter avant `stopBefore`. `keep`
 * décide, message par message, si la lecture continue.
 */
export async function readNewestFirst(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    threadId: string;
    upToMessageId: string;
    stopBefore?: MessagePosition | null;
    keep?: (doc: MessageDoc, readSoFar: MessageDoc[]) => boolean;
  },
): Promise<MessageDoc[]> {
  const newestFirst: MessageDoc[] = [];
  let cursor: string | null = null;
  while (newestFirst.length < MAX_MESSAGES) {
    const page: { page: MessageDoc[]; isDone: boolean; continueCursor: string } =
      await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
        threadId: args.threadId,
        order: "desc",
        statuses: ["success"],
        upToAndIncludingMessageId: args.upToMessageId,
        paginationOpts: { cursor, numItems: PAGE_SIZE },
      });
    for (const doc of page.page) {
      if (args.stopBefore && isBefore(doc, args.stopBefore)) return newestFirst;
      if (args.keep && !args.keep(doc, newestFirst)) return newestFirst;
      newestFirst.push(doc);
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return newestFirst;
}

/**
 * Le contexte d'une génération :
 * - le résumé de la dernière compaction, s'il y en a une, puis ce qui suit
 *   son point de coupe ;
 * - tout le run, quelle que soit sa longueur, et l'historique qui le précède
 *   tant qu'il tient dans `maxTokens` ;
 * - le message d'ouverture remplacé par son `llmPrompt` (et repris à part si
 *   la coupe est passée après lui), les tool calls sans résultat retirés (la
 *   lib fait de même), les deltas du run à leur place.
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
    compaction?: CompactionView | null;
    /** Budget estimé de l'historique hors run ; absent = pas de borne. */
    maxTokens?: number;
  },
): Promise<ModelMessage[]> {
  let runSeen = false;
  let tokens = 0;
  const newestFirst = await readNewestFirst(ctx, {
    threadId: run.threadId,
    upToMessageId: run.promptMessageId,
    stopBefore: run.compaction ?? null,
    keep: (doc) => {
      tokens += estimateTokens(doc);
      const inRun = !runSeen;
      if (doc._id === run.runMessageId) runSeen = true;
      // Le run est toujours gardé en entier ; l'historique, dans le budget.
      return inRun || run.maxTokens === undefined || tokens <= run.maxTokens;
    },
  });

  const window = newestFirst
    .reverse()
    .map((doc) =>
      doc._id === run.runMessageId
        ? { ...doc, message: { role: "user" as const, content: run.llmPrompt } }
        : doc,
    );

  const head: ModelMessage[] = [];
  if (run.compaction) {
    head.push({ role: "user", content: run.compaction.summary });
    // Compaction en plein run : la demande d'origine reste devant le modèle.
    if (!runSeen) head.push({ role: "user", content: run.llmPrompt });
  }
  return [
    ...head,
    ...withUpdates(filterOutOrphanedToolMessages(window), run.updates ?? []),
  ];
}

/**
 * Le point de coupe d'une compaction : on garde tel quel ce qui tient dans
 * `keepTokens` en partant du plus récent, sans jamais commencer la partie
 * gardée par un résultat de tool (il doit rester avec son appel). `null` :
 * rien d'assez ancien à résumer.
 */
export function findCut(
  oldestFirst: MessageDoc[],
  keepTokens: number,
): MessageDoc | null {
  let kept = 0;
  let cut = oldestFirst.length;
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    kept += estimateTokens(oldestFirst[i]);
    cut = i;
    if (kept >= keepTokens) break;
  }
  while (cut > 0 && oldestFirst[cut].message?.role === "tool") cut--;
  return cut > 0 ? oldestFirst[cut] : null;
}

/** Le texte tapé par l'utilisateur, sans le contexte qui l'enveloppe. */
export function userText(doc: MessageDoc): string {
  const text = doc.text ?? "";
  const match = /(?:^|\n)<user_message>\n([\s\S]*)\n<\/user_message>\s*$/.exec(
    text,
  );
  return (match ? match[1] : text).trim();
}

const SERIALIZED_TOOL_RESULT_CHARS = 2000;

/**
 * Une conversation en texte plat, pour un résumé hors cache : le modèle ne
 * doit pas la prendre pour une conversation à continuer. Résultats de tools
 * tronqués.
 */
export function serializeForSummary(oldestFirst: MessageDoc[]): string {
  const lines: string[] = [];
  for (const doc of oldestFirst) {
    const message = doc.message;
    if (!message) continue;
    const parts = Array.isArray(message.content)
      ? message.content
      : [{ type: "text" as const, text: String(message.content) }];
    for (const part of parts) {
      if (part.type === "text") {
        const label = message.role === "user" ? "User" : "Assistant";
        const text = message.role === "user" ? userText(doc) : part.text;
        if (text.trim()) lines.push(`[${label}]: ${text}`);
      } else if (part.type === "tool-call") {
        lines.push(
          `[Assistant tool call]: ${part.toolName} ${JSON.stringify(part.input ?? (part as { args?: unknown }).args ?? {})}`,
        );
      } else if (part.type === "tool-result") {
        const output = JSON.stringify(part.output ?? "");
        lines.push(
          `[Tool result ${part.toolName}]: ${
            output.length > SERIALIZED_TOOL_RESULT_CHARS
              ? `${output.slice(0, SERIALIZED_TOOL_RESULT_CHARS)}… [truncated]`
              : output
          }`,
        );
      }
    }
  }
  return lines.join("\n");
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
