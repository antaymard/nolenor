import {createTool} from "@convex-dev/agent";
import {z} from "zod";
import {internal} from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import {toolAgentNames, type ThreadCtx} from "../agentConfig";
import {type ToolConfig, toolError} from "./toolHelpers";

export const loadSkillToolConfig: ToolConfig = {
  name: "load_skill",
  authorized_agents: [toolAgentNames.nole],
};

export default function loadSkillTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  return createTool({
    description:
      "Load a resource by its exact name. First tries to match a skill listed in <available_skills> (returns the skill body and the list of its attachments). If no skill matches, tries to match an attachment that belongs to one of your accessible skills (returns the attachment content). Use this tool when the user's request matches a skill, then again with an attachment name as referenced in the skill body.",
    inputSchema: z.object({
      name: z
        .string()
        .describe(
          "The exact name of a skill (as listed in <available_skills>) or of an attachment (as referenced in a previously loaded skill's body).",
        ),
    }),
    execute: async (ctx, input): Promise<string> => {
      try {
        const lookup = await ctx.runQuery(
          internal.wrappers.skillWrappers.findByNameForUser,
          {
            userId: threadCtx.authUserId,
            name: input.name,
          },
        );

        if (lookup?.kind === "system") {
          const { skill } = lookup;
          return `<skill title="${skill.name}" description="${skill.description}">\n${skill.content}\n</skill>`;
        }

        if (lookup?.kind === "user") {
          const { skill } = lookup;
          const attachments = await ctx.runQuery(
            internal.wrappers.skillWrappers.listAttachments,
            { skillId: skill._id },
          );

          const attachmentsXml =
            attachments.length > 0
              ? `\n<attachments>\n${attachments
                  .map(
                    (a: Doc<"skillAttachments">) =>
                      `  <attachment name="${a.name}" type="${a.type}" />`,
                  )
                  .join("\n")}\n</attachments>`
              : "";

          return `<skill title="${skill.name}" description="${skill.description}">\n${skill.content}${attachmentsXml}\n</skill>`;
        }

        const attachmentMatch = await ctx.runQuery(
          internal.wrappers.skillWrappers.findAttachmentByNameForUser,
          {
            userId: threadCtx.authUserId,
            name: input.name,
          },
        );

        if (attachmentMatch) {
          return `<attachment name="${attachmentMatch.attachment.name}" type="${attachmentMatch.attachment.type}" parent_skill="${attachmentMatch.skill.name}">\n${attachmentMatch.attachment.content}\n</attachment>`;
        }

        return toolError(
          `No skill or attachment named '${input.name}' is available.`,
        );
      } catch (error) {
        return toolError(
          `Error while loading skill: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
