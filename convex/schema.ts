import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { canvasesValidator } from "./schemas/canvasesSchema";
import { nodeDatasValidator } from "./schemas/nodeDatasSchema";
import { scheduledJobsValidator } from "./schemas/scheduledJobsSchema";
import { sharesValidator } from "./schemas/sharesSchema";
import { memoriesValidator } from "./schemas/memoriesSchema";
import { searchableChunksValidator } from "./schemas/searchableChunksSchema";
import { wishlistEmailsValidator } from "./schemas/wishlistEmailsSchema";
import { tasksValidator } from "./schemas/tasksSchema";
import { skillsValidator } from "./schemas/skillsSchema";
import { skillAttachmentsValidator } from "./schemas/skillAttachmentsSchema";

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

  tasks: defineTable(tasksValidator)
    .index("by_threadId", ["threadId"])
    .index("by_canvasId_and_status", ["canvasId", "status"])
    .index("by_nodeId", ["nodeId"])
    .index("by_taskId", ["id"]),
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
});

export default schema;
