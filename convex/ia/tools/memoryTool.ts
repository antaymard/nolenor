import {createTool} from "@convex-dev/agent";
import {internal} from "../../_generated/api";
import {z} from "zod";
import {toolAgentNames, type ThreadCtx} from "../agentConfig";
import {type ToolConfig, toolError} from "./toolHelpers";

const MAX_USER_MEMORY_CHARS = 1300;
const MAX_CANVAS_MEMORY_CHARS = 2500;

export const memoryToolConfig: ToolConfig = {
  name: "memory",
  authorized_agents: [toolAgentNames.nole],
};

function parseEntries(rawContent?: string | null): string[] {
  if (!rawContent) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function formatUsage(currentChars: number, maxChars: number): string {
  const percentage = Math.round((currentChars / maxChars) * 100);
  return `${percentage}% - ${currentChars}/${maxChars} chars`;
}

export default function memoryToolFactory({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  return createTool({
    description:
      "Read or update persistent user or canvas memories. User and canvas memories are already loaded into the system prompt at the beginning of the session as a frozen snapshot. Use this tool to read or modify them so changes stay persisted for future sessions.",
    inputSchema: z.object({
      explanation: z
        .string()
        .describe("3-5 words explaining the research intent."),
      action: z.enum(["add", "remove", "replace", "read"]),
      target: z.enum(["user", "canvas"]),
      content: z.string().optional().describe("Required for add and replace."),
      old_string: z
        .string()
        .optional()
        .describe("Required for remove and replace."),
    }),
    execute: async (ctx, input): Promise<string> => {
      try {
        const targetConfig =
          input.target === "user"
            ? {
                subjectType: "user" as const,
                subjectId: threadCtx.authUserId,
              }
            : {
                subjectType: "canvas" as const,
                subjectId: threadCtx.canvasId,
              };

        const existingMemory = await ctx.runQuery(
          internal.wrappers.memoryWrappers.read,
          {
            subjectId: targetConfig.subjectId,
            type: "memory",
          },
        );

        const entries = parseEntries(existingMemory?.content);
        const maxChars =
          input.target === "user"
            ? MAX_USER_MEMORY_CHARS
            : MAX_CANVAS_MEMORY_CHARS;

        const buildSuccessResult = (nextEntries: string[]) => {
          const serialized = JSON.stringify(nextEntries);
          return JSON.stringify({
            success: true,
            target: input.target,
            entries: nextEntries,
            usage: formatUsage(serialized.length, maxChars),
            entry_count: nextEntries.length,
          });
        };

        const saveEntries = async (nextEntries: string[]) => {
          const serialized = JSON.stringify(nextEntries);
          if (serialized.length > maxChars) {
            const currentSerialized = JSON.stringify(entries);
            const candidateLength = input.content?.length ?? 0;
            return toolError(
              `Memory at ${currentSerialized.length}/${maxChars} chars. Adding this entry (${candidateLength} chars) would exceed the limit.`,
            );
          }

          await ctx.runMutation(internal.wrappers.memoryWrappers.upsert, {
            subjectType: targetConfig.subjectType,
            subjectId: targetConfig.subjectId,
            type: "memory",
            content: serialized,
          });

          return buildSuccessResult(nextEntries);
        };

        if (input.action === "read") {
          return buildSuccessResult(entries);
        }

        if (input.action === "add") {
          const newEntry = input.content?.trim();
          if (!newEntry) {
            return toolError("content is required for add.");
          }

          return await saveEntries([...entries, newEntry]);
        }

        if (input.action === "remove") {
          const oldString = input.old_string?.trim();
          if (!oldString) {
            return toolError("old_string is required for remove.");
          }

          const entryIndex = entries.findIndex((entry) =>
            entry.includes(oldString),
          );
          if (entryIndex === -1) {
            return toolError(`No memory entry found containing: ${oldString}`);
          }

          const nextEntries = entries.filter(
            (_, index) => index !== entryIndex,
          );
          return await saveEntries(nextEntries);
        }

        const oldString = input.old_string?.trim();
        const replacement = input.content?.trim();

        if (!oldString) {
          return toolError("old_string is required for replace.");
        }

        if (!replacement) {
          return toolError("content is required for replace.");
        }

        const entryIndex = entries.findIndex((entry) =>
          entry.includes(oldString),
        );
        if (entryIndex === -1) {
          return toolError(`No memory entry found containing: ${oldString}`);
        }

        const nextEntries = [...entries];
        nextEntries[entryIndex] = replacement;

        return await saveEntries(nextEntries);
      } catch (error) {
        return toolError(
          `Error while using memory tool: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
