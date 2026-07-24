import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { apiTokensValidator } from "./schemas/apiTokensSchema";
import { canvasesValidator } from "./schemas/canvasesSchema";
import { nodeDatasValidator } from "./schemas/nodeDatasSchema";
import { nodeDataVersionsValidator } from "./schemas/nodeDataVersionsSchema";
import { scheduledJobsValidator } from "./schemas/scheduledJobsSchema";
import { sharesValidator } from "./schemas/sharesSchema";
import { memoriesValidator } from "./schemas/memoriesSchema";
import { searchableChunksValidator } from "./schemas/searchableChunksSchema";
import { wishlistEmailsValidator } from "./schemas/wishlistEmailsSchema";
import { taskExecutionsValidator } from "./schemas/taskExecutionsSchema";
import { skillsValidator } from "./schemas/skillsSchema";
import { skillAttachmentsValidator } from "./schemas/skillAttachmentsSchema";
import { messageMetadataValidator } from "./schemas/messageMetadataSchema";
import { recipesValidor } from "./schemas/recipesSchema";
import { threadMetadataValidator } from "./schemas/threadMetadataSchema";

const schema = defineSchema({
  ...authTables,

  // ============================================================================
  // CANVAS
  // ============================================================================
  canvases: defineTable(canvasesValidator)
    .index("by_creator", ["creatorId"])
    .index("by_creator_and_updatedAt", ["creatorId", "updatedAt"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["creatorId"],
    }),

  nodeDatas: defineTable(nodeDatasValidator).index("by_canvasId", ["canvasId"]),

  // Checkpoints invisibles des values de nodeDatas (1 snapshot pré-write par
  // session d'édition d'un acteur). Purgés par cron après 30 jours ; ils
  // survivent volontairement à la suppression du nodeData (corbeille de fait).
  nodeDataVersions: defineTable(nodeDataVersionsValidator).index(
    "by_nodeDataId",
    ["nodeDataId"],
  ),

  // ============================================================================
  // SHARES
  // ============================================================================
  shares: defineTable(sharesValidator)
    .index("by_canvas_and_user", ["canvasId", "userId"])
    .index("by_user", ["userId"])
    .index("by_canvas", ["canvasId"]),

  scheduledJobs: defineTable(scheduledJobsValidator).index("by_nodeDataId", [
    "nodesDataId",
  ]),

  memories: defineTable(memoriesValidator)
    .index("by_subject_and_type", ["subjectId", "type"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["subjectType", "subjectId", "type"],
    }),

  // ============================================================================
  // SEARCH
  // ============================================================================
  searchableChunks: defineTable(searchableChunksValidator)
    .index("by_nodeDataId", ["nodeDataId"])
    .index("by_nodeId", ["nodeId"])
    .index("by_canvasId", ["canvasId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["canvasId", "nodeDataId", "nodeType", "chunkType"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["canvasId", "nodeDataId", "nodeType", "chunkType"],
    }),

  wishlistEmails: defineTable(wishlistEmailsValidator).index("by_email", [
    "email",
  ]),

  taskExecutions: defineTable(taskExecutionsValidator).index("by_threadId", [
    "threadId",
  ]),
  // ============================================================================
  // SKILLS
  // ============================================================================
  skills: defineTable(skillsValidator)
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"])
    .index("by_isSystem", ["isSystem"]),

  skillAttachments: defineTable(skillAttachmentsValidator)
    .index("by_skill", ["skillId"])
    .index("by_skill_and_name", ["skillId", "name"]),

  recipes: defineTable(recipesValidor).index("by_user", ["userId"]),

  // ============================================================================
  // MESSAGE METADATA (chat UX: model/usage/cost per assistant message,
  // attachments per user message)
  // ============================================================================
  messageMetadata: defineTable(messageMetadataValidator)
    .index("by_messageId", ["messageId"])
    .index("by_threadId", ["threadId"]),
  threadMetadata: defineTable(threadMetadataValidator)
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId"]),

  // ============================================================================
  // API TOKENS
  // ============================================================================
  apiTokens: defineTable(apiTokensValidator)
    .index("by_user", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),
});

export default schema;
