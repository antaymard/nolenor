import type { ToolSet } from "ai";
import { type ThreadCtx, type ToolAgentName } from "../agentConfig";
import createConnectionTool, {
  createConnectionToolConfig,
} from "./createConnectionTool";
import createNodeTool, { createNodeToolConfig } from "./createNodeTool";
import groupNodesTool, { groupNodesToolConfig } from "./groupNodesTool";
import deleteElementsTool, {
  deleteElementsToolConfig,
} from "./deleteElementsTool";
import moveAndStyleNodesTool, {
  moveAndStyleNodesToolConfig,
} from "./moveAndStyleNodesTool";
import patchAppNodeCodeTool, {
  patchAppNodeCodeToolConfig,
} from "./patchAppNodeCodeTool";
import { blockNoteToolDefinitions } from "./blockNoteTools";
import loadSkillTool, { loadSkillToolConfig } from "./loadSkillTool";
import memoryToolFactory, { memoryToolConfig } from "./memoryTool";
import { openWebPageTool, openWebPageToolConfig } from "./openWebPageTool";
import viewImageTool, { viewImageToolConfig } from "./viewImageTool";
import setNodeDataTool, { setNodeDataToolConfig } from "./setNodeDataTool";
import tableDeleteRowsTool, {
  tableDeleteRowsToolConfig,
} from "./tableDeleteRowsTools";
import tableInsertRowsTool, {
  tableInsertRowsToolConfig,
} from "./tableInsertRowsTool";
import tableUpdateRowsTool, {
  tableUpdateRowsToolConfig,
} from "./tableUpdateRowsTool";
import tableUpdateSchemaTool, {
  tableUpdateSchemaToolConfig,
} from "./tableUpdateSchemaTool";
import { type ToolConfig } from "./toolHelpers";
import { websearchTool, websearchToolConfig } from "./websearchTool";
import bashTool, { bashToolConfig } from "../../tools/shell/bash.agent";
import listUserCanvasesTool, {
  listUserCanvasesToolConfig,
} from "./listUserCanvasesTool";

type AgentTool = ToolSet[string];

type ToolFactoryContext = {
  agentName: ToolAgentName;
  threadCtx: ThreadCtx;
  /**
   * Le modèle de CE run sait-il lire une image. Distinct de
   * `ToolConfig.requireMultiModal`, qui décide si un tool existe : ici un tool
   * existant adapte ce qu'il rend (cf. `bash` : `nole read` ne renvoie à
   * view_image que si le modèle sait lire une image).
   */
  isMultimodal: boolean;
};

type ToolRegistration = {
  config: ToolConfig;
  factory: (context: ToolFactoryContext) => AgentTool | null;
};

const toolRegistry: ToolRegistration[] = [
  {
    config: patchAppNodeCodeToolConfig,
    factory: ({ threadCtx }) => patchAppNodeCodeTool({ threadCtx }),
  },
  {
    config: memoryToolConfig,
    factory: ({ threadCtx }) => memoryToolFactory({ threadCtx }),
  },
  {
    config: bashToolConfig,
    factory: ({ threadCtx, isMultimodal }) =>
      bashTool({ threadCtx, isMultimodal }),
  },
  {
    config: viewImageToolConfig,
    factory: ({ threadCtx }) => viewImageTool({ threadCtx }),
  },
  {
    config: openWebPageToolConfig,
    factory: () => openWebPageTool,
  },
  {
    config: websearchToolConfig,
    factory: () => websearchTool,
  },
  ...blockNoteToolDefinitions,
  {
    config: tableUpdateRowsToolConfig,
    factory: ({ threadCtx }) => tableUpdateRowsTool({ threadCtx }),
  },
  {
    config: tableInsertRowsToolConfig,
    factory: ({ threadCtx }) => tableInsertRowsTool({ threadCtx }),
  },
  {
    config: tableDeleteRowsToolConfig,
    factory: ({ threadCtx }) => tableDeleteRowsTool({ threadCtx }),
  },
  {
    config: tableUpdateSchemaToolConfig,
    factory: ({ threadCtx }) => tableUpdateSchemaTool({ threadCtx }),
  },
  {
    config: createNodeToolConfig,
    factory: ({ threadCtx }) => createNodeTool({ threadCtx }),
  },
  {
    config: groupNodesToolConfig,
    factory: ({ threadCtx }) => groupNodesTool({ threadCtx }),
  },
  {
    config: moveAndStyleNodesToolConfig,
    factory: ({ threadCtx }) => moveAndStyleNodesTool({ threadCtx }),
  },
  {
    config: deleteElementsToolConfig,
    factory: ({ threadCtx }) => deleteElementsTool({ threadCtx }),
  },
  {
    config: createConnectionToolConfig,
    factory: ({ threadCtx }) => createConnectionTool({ threadCtx }),
  },
  {
    config: setNodeDataToolConfig,
    factory: ({ threadCtx }) => setNodeDataTool({ threadCtx }),
  },
  {
    config: loadSkillToolConfig,
    factory: ({ threadCtx }) => loadSkillTool({ threadCtx }),
  },
  {
    config: listUserCanvasesToolConfig,
    factory: ({ threadCtx }) => listUserCanvasesTool({ threadCtx }),
  },
];

export function getToolsForAgent({
  agentName,
  threadCtx,
  extraTools = {},
  isMultimodal = false,
}: {
  agentName: ToolAgentName;
  threadCtx: ThreadCtx;
  extraTools?: ToolSet;
  isMultimodal?: boolean;
}): ToolSet {
  const resolvedTools: ToolSet = {};

  for (const registration of toolRegistry) {
    if (!registration.config.authorized_agents.includes(agentName)) {
      continue;
    }

    if (registration.config.requireMultiModal && !isMultimodal) {
      continue;
    }

    const tool = registration.factory({ agentName, threadCtx, isMultimodal });
    if (!tool) {
      continue;
    }

    resolvedTools[registration.config.name] = tool;
  }

  return { ...resolvedTools, ...extraTools };
}

export const agentToolRegistry = toolRegistry;
