/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiUsage from "../aiUsage.js";
import type * as apiTokens from "../apiTokens.js";
import type * as auth from "../auth.js";
import type * as canvasEdges from "../canvasEdges.js";
import type * as canvasNodes from "../canvasNodes.js";
import type * as canvases from "../canvases.js";
import type * as config_errorsConfig from "../config/errorsConfig.js";
import type * as config_fieldConfig from "../config/fieldConfig.js";
import type * as config_fieldVariants from "../config/fieldVariants.js";
import type * as config_nodeConfig from "../config/nodeConfig.js";
import type * as config_optionDescriptors from "../config/optionDescriptors.js";
import type * as config_templateConfig from "../config/templateConfig.js";
import type * as config_uploadsConfig from "../config/uploadsConfig.js";
import type * as crons from "../crons.js";
import type * as dataExport from "../dataExport.js";
import type * as hotposts from "../hotposts.js";
import type * as http from "../http.js";
import type * as ia_agentConfig from "../ia/agentConfig.js";
import type * as ia_agents from "../ia/agents.js";
import type * as ia_helpers__externalDeps from "../ia/helpers/_externalDeps.js";
import type * as ia_helpers_blockNoteMarkdown from "../ia/helpers/blockNoteMarkdown.js";
import type * as ia_helpers_blockNoteXmlRepair from "../ia/helpers/blockNoteXmlRepair.js";
import type * as ia_helpers_composioSanitizer from "../ia/helpers/composioSanitizer.js";
import type * as ia_helpers_customFieldLLMCodecs from "../ia/helpers/customFieldLLMCodecs.js";
import type * as ia_helpers_customTemplateHelpers from "../ia/helpers/customTemplateHelpers.js";
import type * as ia_helpers_generateCanvasMinimap from "../ia/helpers/generateCanvasMinimap.js";
import type * as ia_helpers_generateMessageContext from "../ia/helpers/generateMessageContext.js";
import type * as ia_helpers_getCanvasChangesSinceLastMessage from "../ia/helpers/getCanvasChangesSinceLastMessage.js";
import type * as ia_helpers_headlessBlockNote from "../ia/helpers/headlessBlockNote.js";
import type * as ia_helpers_makeNodeDataLLMFriendly from "../ia/helpers/makeNodeDataLLMFriendly.js";
import type * as ia_helpers_nodeDataSchemaXml from "../ia/helpers/nodeDataSchemaXml.js";
import type * as ia_helpers_nodeFieldsAndTypesHelper from "../ia/helpers/nodeFieldsAndTypesHelper.js";
import type * as ia_helpers_nodeInputSchemaValidatorForLLM from "../ia/helpers/nodeInputSchemaValidatorForLLM.js";
import type * as ia_helpers_pdfChunkFormatters from "../ia/helpers/pdfChunkFormatters.js";
import type * as ia_helpers_tableCellValidation from "../ia/helpers/tableCellValidation.js";
import type * as ia_imageGeneration from "../ia/imageGeneration.js";
import type * as ia_imageGenerationRun from "../ia/imageGenerationRun.js";
import type * as ia_nole from "../ia/nole.js";
import type * as ia_noleCompletion from "../ia/noleCompletion.js";
import type * as ia_subAgentErrors from "../ia/subAgentErrors.js";
import type * as ia_systemPrompts_noleSystemPrompt from "../ia/systemPrompts/noleSystemPrompt.js";
import type * as ia_systemPrompts_supervisorSystemPrompt from "../ia/systemPrompts/supervisorSystemPrompt.js";
import type * as ia_systemPrompts_systemParts from "../ia/systemPrompts/systemParts.js";
import type * as ia_systemPrompts_workerSystemPrompt from "../ia/systemPrompts/workerSystemPrompt.js";
import type * as ia_tools_blockNoteTools from "../ia/tools/blockNoteTools.js";
import type * as ia_tools_createConnectionTool from "../ia/tools/createConnectionTool.js";
import type * as ia_tools_createNodeTool from "../ia/tools/createNodeTool.js";
import type * as ia_tools_fullTextSearchTool from "../ia/tools/fullTextSearchTool.js";
import type * as ia_tools_index from "../ia/tools/index.js";
import type * as ia_tools_listNodesTool from "../ia/tools/listNodesTool.js";
import type * as ia_tools_listUserCanvasesTool from "../ia/tools/listUserCanvasesTool.js";
import type * as ia_tools_loadSkillTool from "../ia/tools/loadSkillTool.js";
import type * as ia_tools_memoryTool from "../ia/tools/memoryTool.js";
import type * as ia_tools_openWebPageTool from "../ia/tools/openWebPageTool.js";
import type * as ia_tools_patchAppNodeCodeTool from "../ia/tools/patchAppNodeCodeTool.js";
import type * as ia_tools_readNodesTool from "../ia/tools/readNodesTool.js";
import type * as ia_tools_runSubAgentTool from "../ia/tools/runSubAgentTool.js";
import type * as ia_tools_setNodeDataTool from "../ia/tools/setNodeDataTool.js";
import type * as ia_tools_tableDeleteRowsTools from "../ia/tools/tableDeleteRowsTools.js";
import type * as ia_tools_tableInsertRowsTool from "../ia/tools/tableInsertRowsTool.js";
import type * as ia_tools_tableUpdateRowsTool from "../ia/tools/tableUpdateRowsTool.js";
import type * as ia_tools_tableUpdateSchemaTool from "../ia/tools/tableUpdateSchemaTool.js";
import type * as ia_tools_toolHelpers from "../ia/tools/toolHelpers.js";
import type * as ia_tools_viewImageTool from "../ia/tools/viewImageTool.js";
import type * as ia_tools_websearchTool from "../ia/tools/websearchTool.js";
import type * as ia_usage from "../ia/usage.js";
import type * as ia_worker from "../ia/worker.js";
import type * as lib_apiTokenCrypto from "../lib/apiTokenCrypto.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_blockNoteDocument from "../lib/blockNoteDocument.js";
import type * as lib_datePill from "../lib/datePill.js";
import type * as lib_getNodeDataTitle from "../lib/getNodeDataTitle.js";
import type * as lib_jsonSchemaMinimap from "../lib/jsonSchemaMinimap.js";
import type * as lib_llmId from "../lib/llmId.js";
import type * as lib_parseModelPrice from "../lib/parseModelPrice.js";
import type * as lib_parseSkillFrontmatter from "../lib/parseSkillFrontmatter.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as lib_r2Keys from "../lib/r2Keys.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_searchScoring from "../lib/searchScoring.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_textSanitize from "../lib/textSanitize.js";
import type * as lib_usageDay from "../lib/usageDay.js";
import type * as lib_xml from "../lib/xml.js";
import type * as links from "../links.js";
import type * as mcp_access from "../mcp/access.js";
import type * as mcp_auth from "../mcp/auth.js";
import type * as mcp_execute from "../mcp/execute.js";
import type * as mcp_registry from "../mcp/registry.js";
import type * as mcp_server from "../mcp/server.js";
import type * as memories from "../memories.js";
import type * as messageMetadata from "../messageMetadata.js";
import type * as models_aiUsageModels from "../models/aiUsageModels.js";
import type * as models_canvasEdgeModels from "../models/canvasEdgeModels.js";
import type * as models_canvasModels from "../models/canvasModels.js";
import type * as models_canvasNodeModels from "../models/canvasNodeModels.js";
import type * as models_memoryModels from "../models/memoryModels.js";
import type * as models_messageMetadataModels from "../models/messageMetadataModels.js";
import type * as models_nodeDataModels from "../models/nodeDataModels.js";
import type * as models_nodeDataVersionModels from "../models/nodeDataVersionModels.js";
import type * as models_nodeTemplateModels from "../models/nodeTemplateModels.js";
import type * as models_r2ObjectModels from "../models/r2ObjectModels.js";
import type * as models_searchableChunkModels from "../models/searchableChunkModels.js";
import type * as models_skillModels from "../models/skillModels.js";
import type * as models_threadMetadataModels from "../models/threadMetadataModels.js";
import type * as nodeDataVersions from "../nodeDataVersions.js";
import type * as nodeDatas from "../nodeDatas.js";
import type * as nodeTemplates from "../nodeTemplates.js";
import type * as recipes from "../recipes.js";
import type * as schemas_aiUsageDailySchema from "../schemas/aiUsageDailySchema.js";
import type * as schemas_aiUsageEventsSchema from "../schemas/aiUsageEventsSchema.js";
import type * as schemas_aiUsageSourceSchema from "../schemas/aiUsageSourceSchema.js";
import type * as schemas_aiUsageTokensSchema from "../schemas/aiUsageTokensSchema.js";
import type * as schemas_apiTokensSchema from "../schemas/apiTokensSchema.js";
import type * as schemas_canvasesSchema from "../schemas/canvasesSchema.js";
import type * as schemas_fieldTypeSchema from "../schemas/fieldTypeSchema.js";
import type * as schemas_memoriesSchema from "../schemas/memoriesSchema.js";
import type * as schemas_messageMetadataSchema from "../schemas/messageMetadataSchema.js";
import type * as schemas_nodeDataVersionsSchema from "../schemas/nodeDataVersionsSchema.js";
import type * as schemas_nodeDatasSchema from "../schemas/nodeDatasSchema.js";
import type * as schemas_nodeTemplatesSchema from "../schemas/nodeTemplatesSchema.js";
import type * as schemas_nodeTypeSchema from "../schemas/nodeTypeSchema.js";
import type * as schemas_r2ObjectsSchema from "../schemas/r2ObjectsSchema.js";
import type * as schemas_recipesSchema from "../schemas/recipesSchema.js";
import type * as schemas_scheduledJobsSchema from "../schemas/scheduledJobsSchema.js";
import type * as schemas_searchableChunksSchema from "../schemas/searchableChunksSchema.js";
import type * as schemas_sharesSchema from "../schemas/sharesSchema.js";
import type * as schemas_skillAttachmentsSchema from "../schemas/skillAttachmentsSchema.js";
import type * as schemas_skillsSchema from "../schemas/skillsSchema.js";
import type * as schemas_taskExecutionsSchema from "../schemas/taskExecutionsSchema.js";
import type * as schemas_threadMetadataSchema from "../schemas/threadMetadataSchema.js";
import type * as schemas_wishlistEmailsSchema from "../schemas/wishlistEmailsSchema.js";
import type * as searchable_chunkBuilder from "../searchable/chunkBuilder.js";
import type * as searchableChunks from "../searchableChunks.js";
import type * as shares from "../shares.js";
import type * as skills from "../skills.js";
import type * as slideshows from "../slideshows.js";
import type * as speech from "../speech.js";
import type * as threads from "../threads.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as voice from "../voice.js";
import type * as wishlist from "../wishlist.js";
import type * as wrappers_aiUsageWrappers from "../wrappers/aiUsageWrappers.js";
import type * as wrappers_canvasEdgeWrappers from "../wrappers/canvasEdgeWrappers.js";
import type * as wrappers_canvasNodeWrappers from "../wrappers/canvasNodeWrappers.js";
import type * as wrappers_canvasWrappers from "../wrappers/canvasWrappers.js";
import type * as wrappers_memoryWrappers from "../wrappers/memoryWrappers.js";
import type * as wrappers_messageMetadataWrappers from "../wrappers/messageMetadataWrappers.js";
import type * as wrappers_nodeDataWrappers from "../wrappers/nodeDataWrappers.js";
import type * as wrappers_nodeTemplateWrappers from "../wrappers/nodeTemplateWrappers.js";
import type * as wrappers_searchableChunkWrappers from "../wrappers/searchableChunkWrappers.js";
import type * as wrappers_skillWrappers from "../wrappers/skillWrappers.js";
import type * as wrappers_threadMetadataWrappers from "../wrappers/threadMetadataWrappers.js";
import type * as wrappers_userWrappers from "../wrappers/userWrappers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiUsage: typeof aiUsage;
  apiTokens: typeof apiTokens;
  auth: typeof auth;
  canvasEdges: typeof canvasEdges;
  canvasNodes: typeof canvasNodes;
  canvases: typeof canvases;
  "config/errorsConfig": typeof config_errorsConfig;
  "config/fieldConfig": typeof config_fieldConfig;
  "config/fieldVariants": typeof config_fieldVariants;
  "config/nodeConfig": typeof config_nodeConfig;
  "config/optionDescriptors": typeof config_optionDescriptors;
  "config/templateConfig": typeof config_templateConfig;
  "config/uploadsConfig": typeof config_uploadsConfig;
  crons: typeof crons;
  dataExport: typeof dataExport;
  hotposts: typeof hotposts;
  http: typeof http;
  "ia/agentConfig": typeof ia_agentConfig;
  "ia/agents": typeof ia_agents;
  "ia/helpers/_externalDeps": typeof ia_helpers__externalDeps;
  "ia/helpers/blockNoteMarkdown": typeof ia_helpers_blockNoteMarkdown;
  "ia/helpers/blockNoteXmlRepair": typeof ia_helpers_blockNoteXmlRepair;
  "ia/helpers/composioSanitizer": typeof ia_helpers_composioSanitizer;
  "ia/helpers/customFieldLLMCodecs": typeof ia_helpers_customFieldLLMCodecs;
  "ia/helpers/customTemplateHelpers": typeof ia_helpers_customTemplateHelpers;
  "ia/helpers/generateCanvasMinimap": typeof ia_helpers_generateCanvasMinimap;
  "ia/helpers/generateMessageContext": typeof ia_helpers_generateMessageContext;
  "ia/helpers/getCanvasChangesSinceLastMessage": typeof ia_helpers_getCanvasChangesSinceLastMessage;
  "ia/helpers/headlessBlockNote": typeof ia_helpers_headlessBlockNote;
  "ia/helpers/makeNodeDataLLMFriendly": typeof ia_helpers_makeNodeDataLLMFriendly;
  "ia/helpers/nodeDataSchemaXml": typeof ia_helpers_nodeDataSchemaXml;
  "ia/helpers/nodeFieldsAndTypesHelper": typeof ia_helpers_nodeFieldsAndTypesHelper;
  "ia/helpers/nodeInputSchemaValidatorForLLM": typeof ia_helpers_nodeInputSchemaValidatorForLLM;
  "ia/helpers/pdfChunkFormatters": typeof ia_helpers_pdfChunkFormatters;
  "ia/helpers/tableCellValidation": typeof ia_helpers_tableCellValidation;
  "ia/imageGeneration": typeof ia_imageGeneration;
  "ia/imageGenerationRun": typeof ia_imageGenerationRun;
  "ia/nole": typeof ia_nole;
  "ia/noleCompletion": typeof ia_noleCompletion;
  "ia/subAgentErrors": typeof ia_subAgentErrors;
  "ia/systemPrompts/noleSystemPrompt": typeof ia_systemPrompts_noleSystemPrompt;
  "ia/systemPrompts/supervisorSystemPrompt": typeof ia_systemPrompts_supervisorSystemPrompt;
  "ia/systemPrompts/systemParts": typeof ia_systemPrompts_systemParts;
  "ia/systemPrompts/workerSystemPrompt": typeof ia_systemPrompts_workerSystemPrompt;
  "ia/tools/blockNoteTools": typeof ia_tools_blockNoteTools;
  "ia/tools/createConnectionTool": typeof ia_tools_createConnectionTool;
  "ia/tools/createNodeTool": typeof ia_tools_createNodeTool;
  "ia/tools/fullTextSearchTool": typeof ia_tools_fullTextSearchTool;
  "ia/tools/index": typeof ia_tools_index;
  "ia/tools/listNodesTool": typeof ia_tools_listNodesTool;
  "ia/tools/listUserCanvasesTool": typeof ia_tools_listUserCanvasesTool;
  "ia/tools/loadSkillTool": typeof ia_tools_loadSkillTool;
  "ia/tools/memoryTool": typeof ia_tools_memoryTool;
  "ia/tools/openWebPageTool": typeof ia_tools_openWebPageTool;
  "ia/tools/patchAppNodeCodeTool": typeof ia_tools_patchAppNodeCodeTool;
  "ia/tools/readNodesTool": typeof ia_tools_readNodesTool;
  "ia/tools/runSubAgentTool": typeof ia_tools_runSubAgentTool;
  "ia/tools/setNodeDataTool": typeof ia_tools_setNodeDataTool;
  "ia/tools/tableDeleteRowsTools": typeof ia_tools_tableDeleteRowsTools;
  "ia/tools/tableInsertRowsTool": typeof ia_tools_tableInsertRowsTool;
  "ia/tools/tableUpdateRowsTool": typeof ia_tools_tableUpdateRowsTool;
  "ia/tools/tableUpdateSchemaTool": typeof ia_tools_tableUpdateSchemaTool;
  "ia/tools/toolHelpers": typeof ia_tools_toolHelpers;
  "ia/tools/viewImageTool": typeof ia_tools_viewImageTool;
  "ia/tools/websearchTool": typeof ia_tools_websearchTool;
  "ia/usage": typeof ia_usage;
  "ia/worker": typeof ia_worker;
  "lib/apiTokenCrypto": typeof lib_apiTokenCrypto;
  "lib/auth": typeof lib_auth;
  "lib/blockNoteDocument": typeof lib_blockNoteDocument;
  "lib/datePill": typeof lib_datePill;
  "lib/getNodeDataTitle": typeof lib_getNodeDataTitle;
  "lib/jsonSchemaMinimap": typeof lib_jsonSchemaMinimap;
  "lib/llmId": typeof lib_llmId;
  "lib/parseModelPrice": typeof lib_parseModelPrice;
  "lib/parseSkillFrontmatter": typeof lib_parseSkillFrontmatter;
  "lib/r2": typeof lib_r2;
  "lib/r2Keys": typeof lib_r2Keys;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/searchScoring": typeof lib_searchScoring;
  "lib/text": typeof lib_text;
  "lib/textSanitize": typeof lib_textSanitize;
  "lib/usageDay": typeof lib_usageDay;
  "lib/xml": typeof lib_xml;
  links: typeof links;
  "mcp/access": typeof mcp_access;
  "mcp/auth": typeof mcp_auth;
  "mcp/execute": typeof mcp_execute;
  "mcp/registry": typeof mcp_registry;
  "mcp/server": typeof mcp_server;
  memories: typeof memories;
  messageMetadata: typeof messageMetadata;
  "models/aiUsageModels": typeof models_aiUsageModels;
  "models/canvasEdgeModels": typeof models_canvasEdgeModels;
  "models/canvasModels": typeof models_canvasModels;
  "models/canvasNodeModels": typeof models_canvasNodeModels;
  "models/memoryModels": typeof models_memoryModels;
  "models/messageMetadataModels": typeof models_messageMetadataModels;
  "models/nodeDataModels": typeof models_nodeDataModels;
  "models/nodeDataVersionModels": typeof models_nodeDataVersionModels;
  "models/nodeTemplateModels": typeof models_nodeTemplateModels;
  "models/r2ObjectModels": typeof models_r2ObjectModels;
  "models/searchableChunkModels": typeof models_searchableChunkModels;
  "models/skillModels": typeof models_skillModels;
  "models/threadMetadataModels": typeof models_threadMetadataModels;
  nodeDataVersions: typeof nodeDataVersions;
  nodeDatas: typeof nodeDatas;
  nodeTemplates: typeof nodeTemplates;
  recipes: typeof recipes;
  "schemas/aiUsageDailySchema": typeof schemas_aiUsageDailySchema;
  "schemas/aiUsageEventsSchema": typeof schemas_aiUsageEventsSchema;
  "schemas/aiUsageSourceSchema": typeof schemas_aiUsageSourceSchema;
  "schemas/aiUsageTokensSchema": typeof schemas_aiUsageTokensSchema;
  "schemas/apiTokensSchema": typeof schemas_apiTokensSchema;
  "schemas/canvasesSchema": typeof schemas_canvasesSchema;
  "schemas/fieldTypeSchema": typeof schemas_fieldTypeSchema;
  "schemas/memoriesSchema": typeof schemas_memoriesSchema;
  "schemas/messageMetadataSchema": typeof schemas_messageMetadataSchema;
  "schemas/nodeDataVersionsSchema": typeof schemas_nodeDataVersionsSchema;
  "schemas/nodeDatasSchema": typeof schemas_nodeDatasSchema;
  "schemas/nodeTemplatesSchema": typeof schemas_nodeTemplatesSchema;
  "schemas/nodeTypeSchema": typeof schemas_nodeTypeSchema;
  "schemas/r2ObjectsSchema": typeof schemas_r2ObjectsSchema;
  "schemas/recipesSchema": typeof schemas_recipesSchema;
  "schemas/scheduledJobsSchema": typeof schemas_scheduledJobsSchema;
  "schemas/searchableChunksSchema": typeof schemas_searchableChunksSchema;
  "schemas/sharesSchema": typeof schemas_sharesSchema;
  "schemas/skillAttachmentsSchema": typeof schemas_skillAttachmentsSchema;
  "schemas/skillsSchema": typeof schemas_skillsSchema;
  "schemas/taskExecutionsSchema": typeof schemas_taskExecutionsSchema;
  "schemas/threadMetadataSchema": typeof schemas_threadMetadataSchema;
  "schemas/wishlistEmailsSchema": typeof schemas_wishlistEmailsSchema;
  "searchable/chunkBuilder": typeof searchable_chunkBuilder;
  searchableChunks: typeof searchableChunks;
  shares: typeof shares;
  skills: typeof skills;
  slideshows: typeof slideshows;
  speech: typeof speech;
  threads: typeof threads;
  uploads: typeof uploads;
  users: typeof users;
  voice: typeof voice;
  wishlist: typeof wishlist;
  "wrappers/aiUsageWrappers": typeof wrappers_aiUsageWrappers;
  "wrappers/canvasEdgeWrappers": typeof wrappers_canvasEdgeWrappers;
  "wrappers/canvasNodeWrappers": typeof wrappers_canvasNodeWrappers;
  "wrappers/canvasWrappers": typeof wrappers_canvasWrappers;
  "wrappers/memoryWrappers": typeof wrappers_memoryWrappers;
  "wrappers/messageMetadataWrappers": typeof wrappers_messageMetadataWrappers;
  "wrappers/nodeDataWrappers": typeof wrappers_nodeDataWrappers;
  "wrappers/nodeTemplateWrappers": typeof wrappers_nodeTemplateWrappers;
  "wrappers/searchableChunkWrappers": typeof wrappers_searchableChunkWrappers;
  "wrappers/skillWrappers": typeof wrappers_skillWrappers;
  "wrappers/threadMetadataWrappers": typeof wrappers_threadMetadataWrappers;
  "wrappers/userWrappers": typeof wrappers_userWrappers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
