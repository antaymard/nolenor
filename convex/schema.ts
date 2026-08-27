import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { apiTokensValidator } from "./schemas/apiTokensSchema";
import { canvasesValidator } from "./schemas/canvasesSchema";
import { nodeDatasValidator } from "./schemas/nodeDatasSchema";
import { nodeTemplatesValidator } from "./schemas/nodeTemplatesSchema";
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
import { aiUsageEventsValidator } from "./schemas/aiUsageEventsSchema";
import { aiUsageDailyValidator } from "./schemas/aiUsageDailySchema";
import { r2ObjectsValidator } from "./schemas/r2ObjectsSchema";

const schema = defineSchema({
  ...authTables,

  // ============================================================================
  // AUTH — surcharge de la table `users` d'@convex-dev/auth
  // ============================================================================
  // `displayName` : le nom que l'utilisateur s'est lui-même donné (Settings →
  // Account), et celui que Nolë utilise pour s'adresser à lui.
  //
  // Champ distinct de `name`, et non une écriture dans `name`, parce que
  // `name` appartient au provider d'auth : pour un provider OAuth, le
  // `createOrUpdateUser` par défaut d'@convex-dev/auth patche le document user
  // avec TOUT le profil renvoyé (`implementation/users.js`) à chaque connexion
  // sur un compte existant. Le profil Google contient `name` : un prénom choisi
  // par l'utilisateur et rangé dans `name` serait donc silencieusement écrasé à
  // chaque login. Ici les deux cases sont séparées — le provider écrit la
  // sienne, nous la nôtre, et la lecture retombe de l'une sur l'autre
  // (`resolveUserDisplayName`).
  //
  // Les index doivent être redéclarés : la surcharge remplace la définition
  // d'authTables, elle ne s'y ajoute pas.
  users: defineTable({
    ...authTables.users.validator.fields,
    displayName: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

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

  nodeDatas: defineTable(nodeDatasValidator)
    .index("by_canvasId", ["canvasId"])
    .index("by_templateId", ["templateId"]),

  // Templates de custom nodes définis par l'utilisateur : champs typés +
  // arbres de layout (node / window). Scopés par user, réutilisables sur
  // tous ses canvases.
  nodeTemplates: defineTable(nodeTemplatesValidator).index("by_creator", [
    "creatorId",
  ]),

  // Reference counting for R2 blobs: a duplicated node shares its original's
  // storage key, so a file may only be deleted once its last referent is gone.
  r2Objects: defineTable(r2ObjectsValidator)
    .index("by_key", ["key"])
    .index("by_nodeDataId", ["nodeDataId"]),

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
    // `agentName` est dans la clé pour que les listings de conversations ne
    // scannent pas les threads de sous-agents (cf. threadMetadataSchema). Le
    // premier sert la home, qui regarde tous les canvas à la fois ; le second
    // les surfaces d'un canvas donné. L'index par `userId` seul qu'ils
    // remplacent n'avait aucun lecteur, et un index se paie à chaque écriture
    // sur la ligne — celle-ci est réécrite une fois par step LLM.
    .index("by_userId_and_agentName", ["userId", "agentName"])
    .index("by_userId_and_canvasId_and_agentName", [
      "userId",
      "canvasId",
      "agentName",
    ])
    .index("by_masterThreadId", ["masterThreadId"]),

  // ============================================================================
  // AI USAGE (ledger append-only + rollup journalier dénormalisé)
  // ============================================================================
  aiUsageEvents: defineTable(aiUsageEventsValidator)
    .index("by_userId_and_day", ["userId", "day"])
    .index("by_threadId", ["threadId"]),

  aiUsageDaily: defineTable(aiUsageDailyValidator)
    // Sert l'upsert (eq/eq/eq + .unique()) ET le scan de plage de la page
    // (eq userId + gte/lte day) : un seul index couvre les deux usages.
    .index("by_userId_and_day_and_model", ["userId", "day", "model"]),

  // ============================================================================
  // API TOKENS
  // ============================================================================
  apiTokens: defineTable(apiTokensValidator)
    .index("by_user", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),
});

export default schema;
