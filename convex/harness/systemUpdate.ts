import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ContextSection, Profile, RunInfo, StepWindow } from "./types";

/**
 * Le `<system_update>` d'un step : ce qui a changé depuis le step précédent
 * (sections du profil) et les souvenirs devenus pertinents. Calculé au début
 * de la génération, écrit une fois sur sa tâche, puis rejoué tel quel.
 *
 * Ne fait jamais échouer une génération : une section qui lève est omise.
 */
export async function resolveSystemUpdate(
  ctx: ActionCtx,
  profile: Profile,
  run: RunInfo,
  claim: {
    taskId: Id<"agentTasks">;
    attempt: number;
    window: StepWindow;
    seenMemoryIds: string[];
    systemUpdate: string | null;
  },
): Promise<string | null> {
  if (claim.systemUpdate !== null) return claim.systemUpdate || null;

  const sections: ContextSection[] = [];
  if (profile.stepContext) {
    try {
      sections.push(...(await profile.stepContext(ctx, run, claim.window)));
    } catch (error) {
      console.error("[harness] stepContext failed", describe(error));
    }
  }

  let memories: { id: string; content: string; score?: number }[] = [];
  if (profile.memory) {
    try {
      const seen = new Set(claim.seenMemoryIds);
      memories = (await profile.memory.recall(ctx, run, claim.window)).filter(
        (memory) => !seen.has(memory.id),
      );
    } catch (error) {
      console.error("[harness] memory recall failed", describe(error));
    }
  }
  if (memories.length > 0) {
    sections.push({
      tag: "memories",
      content: memories
        .map((memory) => `<memory id="${memory.id}">${memory.content}</memory>`)
        .join("\n"),
    });
  }

  const nonEmpty = sections.filter((section) => section.content.trim());
  // Rien de neuf : rien d'écrit, la génération repart sans delta.
  if (nonEmpty.length === 0) return null;

  const content = [
    "<system_update>",
    ...nonEmpty.map(
      (section) => `<${section.tag}>\n${section.content.trim()}\n</${section.tag}>`,
    ),
    "</system_update>",
  ].join("\n");
  const saved = await ctx.runMutation(internal.harness.tasks.saveSystemUpdate, {
    taskId: claim.taskId,
    attempt: claim.attempt,
    systemUpdate: content,
    memories: memories.map(({ id, score }) =>
      score !== undefined ? { id, score } : { id },
    ),
  });
  return saved ?? content;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
