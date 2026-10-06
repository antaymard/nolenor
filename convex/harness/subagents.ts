import { createThread, saveMessage } from "@convex-dev/agent";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { requireCanvasAccess } from "../lib/auth";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { agentTaskKinds } from "../schemas/agentTasksSchema";
import {
  threadRunStatuses,
  type ThreadRunEndStatus,
} from "../schemas/threadMetadataSchema";
import { getProfile } from "./profiles";
import {
  resolveWaitingTool,
  startRun,
  type CurrentRun,
  type KernelToolOutcome,
  type KernelToolStart,
} from "./tasks";

/**
 * Sous-agents : un run de la harness sur son propre thread, lancé par le tool
 * `run_subAgent` d'un run parent. Il a donc tout ce qu'a un run — retry,
 * reprise après crash, deltas, compaction, halo sur le canvas — et aucune
 * limite de durée : rien ne tourne côté parent pendant qu'il travaille.
 *
 * - premier plan : le tool call du parent reste `waiting` ; la fin du run
 *   enfant y écrit son rapport, et le parent enchaîne ;
 * - arrière-plan : le tool rend la main tout de suite ; à la fin, le rapport
 *   revient au thread parent en followUp — placé dans son run en cours, ou
 *   ouvrant un nouveau run.
 *
 * Arrêter le parent arrête ses sous-agents de premier plan (cf.
 * tasks.abortRunTasks). Un sous-agent ne lance pas de sous-agent et ne pose
 * pas de question : il n'est pas face à l'utilisateur.
 */

type SpawnInput = {
  instructions?: unknown;
  canvasId?: unknown;
  background?: unknown;
};

export async function spawnSubagent(
  ctx: MutationCtx,
  start: KernelToolStart,
): Promise<KernelToolOutcome> {
  const { generation } = start;
  const childProfileName = getProfile(generation.profile).subagents?.profile;
  if (!childProfileName) return { done: "Subagents are not available here." };

  const input = (start.input ?? {}) as SpawnInput;
  const brief = typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (!brief) {
    return {
      done: "`instructions` is required and cannot be empty: pass the full brief the worker should execute.",
    };
  }
  const requested =
    typeof input.canvasId === "string" ? input.canvasId.trim() : "";
  const canvasId = requested
    ? ctx.db.normalizeId("canvases", requested)
    : generation.canvasId;
  if (!canvasId) return { done: `"${requested}" is not a valid canvas id.` };
  try {
    await requireCanvasAccess(ctx, canvasId, generation.userId, "editor");
  } catch {
    return {
      done: `No edit access to canvas "${canvasId}": pick another canvas, or leave canvasId empty for the current one.`,
    };
  }

  const childProfile = getProfile(childProfileName);
  const threadId = await createThread(ctx, components.agent, {
    userId: generation.userId,
    title: "__WORKER__",
  });
  // `masterThreadId` rattache la dépense du sous-agent à la conversation qui
  // l'a lancé.
  await ctx.db.insert("threadMetadata", {
    threadId,
    userId: generation.userId,
    canvasId,
    totalUsageUsd: 0,
    agentName: childProfile.agentName,
    masterThreadId: generation.threadId,
  });
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId,
    userId: generation.userId,
    prompt: brief,
  });
  const background = input.background === true;
  await startRun(ctx, {
    threadId,
    userId: generation.userId,
    canvasId,
    startMessageId: messageId,
    profile: childProfile,
    model: generation.model,
    input: { brief },
    parent: {
      taskId: start.toolTaskId,
      threadId: generation.threadId,
      profile: generation.profile,
      background,
      ...(generation.model !== undefined ? { model: generation.model } : {}),
    },
  });
  await ctx.db.patch("agentTasks", start.toolTaskId, { childThreadId: threadId });

  return background
    ? {
        done: "Started in the background. Its report will reach you as a message when it is done — you can keep working or end your answer meanwhile.",
      }
    : { wait: true };
}

/** Fin du run d'un sous-agent : son rapport revient au parent. */
export async function onSubagentRunEnded(
  ctx: MutationCtx,
  current: CurrentRun,
  status: ThreadRunEndStatus,
  errorMessage?: string,
) {
  const parent = current.run.parent;
  if (!parent) return;
  const report =
    status === threadRunStatuses.idle
      ? await finalText(ctx, current.run.startMessageId)
      : status === threadRunStatuses.error
        ? `The subagent failed: ${errorMessage ?? "unknown error"}.`
        : "The subagent was stopped before finishing.";

  if (!parent.background) {
    await resolveWaitingTool(ctx, parent.taskId, {
      status: status === threadRunStatuses.idle ? "completed" : "failed",
      output: report,
    });
    return;
  }

  const task = await ctx.db.get("agentTasks", parent.taskId);
  const label = task?.explanation ?? "Background task";
  await deliverFollowUp(ctx, {
    threadId: parent.threadId,
    profile: parent.profile,
    model: parent.model,
    text: [
      `<subagent_result task="${label.replace(/"/g, "'")}" status="${status === threadRunStatuses.idle ? "done" : status}">`,
      "Sent by the app, not by the user: a background task you started has finished. Tell the user what it found or did, briefly.",
      "",
      report,
      "</subagent_result>",
    ].join("\n"),
  });
}

/** La dernière réponse du run, celle qui fait office de rapport. */
async function finalText(ctx: MutationCtx, runMessageId: string) {
  const generations = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q.eq("runMessageId", runMessageId).eq("kind", agentTaskKinds.generation),
    )
    .take(500);
  const last = generations
    .filter((generation) => generation.responseMessageId)
    .sort((a, b) => (b.step ?? 0) - (a.step ?? 0))[0];
  if (!last?.responseMessageId) return "(The subagent finished without a report.)";
  const [message] = await ctx.runQuery(
    components.agent.messages.getMessagesByIds,
    { messageIds: [last.responseMessageId] },
  );
  return message?.text?.trim() || "(The subagent finished without a report.)";
}

/**
 * Un message de l'app à un thread (followUp) : placé dans son run en cours
 * comme un steer, ou ouvrant un nouveau run s'il est au repos.
 */
async function deliverFollowUp(
  ctx: MutationCtx,
  args: { threadId: string; profile: string; model?: string; text: string },
) {
  const row = await ThreadMetadataModels.findByThreadId(ctx, {
    threadId: args.threadId,
  });
  if (!row) return;
  const input = { userPrompt: args.text };
  if (row.run) {
    await ctx.db.insert("submissions", {
      threadId: row.threadId,
      userId: row.userId,
      canvasId: row.canvasId,
      status: "queued",
      prompt: args.text,
      content: args.text,
      input,
      ...(args.model !== undefined ? { model: args.model } : {}),
      origin: "subagent",
    });
    return;
  }
  const profile = getProfile(args.profile);
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId: row.threadId,
    userId: row.userId,
    prompt: args.text,
  });
  await startRun(ctx, {
    threadId: row.threadId,
    userId: row.userId,
    canvasId: row.canvasId,
    startMessageId: messageId,
    profile,
    model: args.model,
    input,
  });
}
