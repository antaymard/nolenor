import { v } from "convex/values";

const skillAttachmentTypeValidator = v.union(
  v.literal("md"),
  v.literal("txt"),
  v.literal("script_py"),
  v.literal("script_ts"),
);

const skillAttachmentsValidator = v.object({
  skillId: v.id("skills"),
  name: v.string(),
  content: v.string(),
  type: skillAttachmentTypeValidator,
});

export { skillAttachmentsValidator, skillAttachmentTypeValidator };
