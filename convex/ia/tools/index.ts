import type { ToolSet } from "ai";
import { internal } from "../../_generated/api";
import { type ThreadCtx, type ToolAgentName } from "../agentConfig";
import createConnectionTool, {
  createConnectionToolConfig,
} from "./createConnectionTool";
import createNodeTool, { createNodeToolConfig } from "./createNodeTool";
import patchAppNodeCodeTool, {
  patchAppNodeCodeToolConfig,
} from "./patchAppNodeCodeTool";
import { blockNoteToolDefinitions } from "./blockNoteTools";
import fullTextSearchTool, {
  fullTextSearchToolConfig,
} from "./fullTextSearchTool";
import listNodesTool, { listNodesToolConfig } from "./listNodesTool";
import loadSkillTool, { loadSkillToolConfig } from "./loadSkillTool";
import memoryToolFactory, { memoryToolConfig } from "./memoryTool";
import { openWebPageTool, openWebPageToolConfig } from "./openWebPageTool";
import { viewImageTool, viewImageToolConfig } from "./viewImageTool";
import readNodesTool, { readNodesToolConfig } from "./readNodesTool";
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
import { readToolCtx, type ToolConfig } from "./toolHelpers";
import { websearchTool, websearchToolConfig } from "./websearchTool";
import listUserCanvasesTool, {
  listUserCanvasesToolConfig,
} from "./listUserCanvasesTool";

type AgentTool = ToolSet[string];
type ToolExecute = NonNullable<AgentTool["execute"]>;

function readExplanation(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { explanation } = input as { explanation?: unknown };
  if (typeof explanation !== "string") return undefined;
  return explanation.trim() || undefined;
}

/**
 * Recopie l'étiquette du tool call sur la ligne de metadata du thread, pour que
 * le dock et le canvas sachent dire ce que fait une tâche sans avoir sa
 * conversation à l'écran.
 *
 * N'échoue jamais : c'est une trace, elle n'a pas à faire tomber le travail
 * qu'elle décrit.
 */
async function recordActivity(toolThis: unknown, input: unknown): Promise<void> {
  const ctx = readToolCtx(toolThis);
  const text = readExplanation(input);
  if (!ctx?.threadId || !text) return;

  try {
    await ctx.runMutation(
      internal.wrappers.threadMetadataWrappers.recordActivity,
      { threadId: ctx.threadId, text },
    );
  } catch (error) {
    console.error("[tools] failed to record activity", {
      threadId: ctx.threadId,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Enveloppe un tool pour tracer son étiquette.
 *
 * Ici et non dans chaque tool : les vingt tools partagent déjà
 * `EXPLANATION_FIELD`, et leur demander un appel de traçage de plus serait vingt
 * occasions de l'oublier — à commencer par le prochain tool écrit.
 *
 * Deux précautions, chacune contre une panne discrète :
 *
 * - Une `function` et un `.call(this, …)`, jamais une arrow. `createTool` relit
 *   son ctx sur `this` (cf. `readToolCtx`) : une arrow le perdrait, et TOUS les
 *   tools throwraient « you must provide the ctx ».
 * - Le tool est lancé le premier, et la trace attendue *à côté* de lui plutôt
 *   qu'avant. L'attendre n'ajoute donc aucune latence, tout en la mettant à
 *   l'abri de la fin de l'action Convex, qui emporterait une promesse en vol —
 *   or celle qu'on perdrait serait la dernière du tour, celle qui reste
 *   affichée. Et un tool qui rendrait un `AsyncIterable` (cf. `resolveToolOutput`
 *   côté MCP) traverse sans être emballé dans une promesse.
 *
 * Les tools sans `execute` (sortie fournie par le provider) passent inchangés.
 */
function withActivityTracking(tool: AgentTool): AgentTool {
  const execute = tool.execute;
  if (typeof execute !== "function") return tool;

  const tracked: ToolExecute = function (this: unknown, input, options) {
    const output = execute.call(this, input, options);
    const recorded = recordActivity(this, input);
    if (!isPromiseLike(output)) return output;
    return Promise.all([output, recorded]).then(([value]) => value);
  };

  return { ...tool, execute: tracked };
}

type ToolFactoryContext = {
  agentName: ToolAgentName;
  threadCtx: ThreadCtx;
};

type ToolRegistration = {
  config: ToolConfig;
  factory: (context: ToolFactoryContext) => AgentTool | null;
};

const toolRegistry: ToolRegistration[] = [
  {
    config: listNodesToolConfig,
    factory: ({ threadCtx }) => listNodesTool({ threadCtx }),
  },
  {
    config: patchAppNodeCodeToolConfig,
    factory: ({ threadCtx }) => patchAppNodeCodeTool({ threadCtx }),
  },
  {
    config: fullTextSearchToolConfig,
    factory: ({ threadCtx }) => fullTextSearchTool({ threadCtx }),
  },
  {
    config: memoryToolConfig,
    factory: ({ threadCtx }) => memoryToolFactory({ threadCtx }),
  },
  {
    config: readNodesToolConfig,
    factory: ({ threadCtx }) => readNodesTool({ threadCtx }),
  },
  {
    config: viewImageToolConfig,
    factory: () => viewImageTool,
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

    const tool = registration.factory({ agentName, threadCtx });
    if (!tool) {
      continue;
    }

    resolvedTools[registration.config.name] = tool;
  }

  // Les `extraTools` passent par la même enveloppe : ce qui porte une
  // `explanation` est tracé, le reste traverse sans rien payer.
  const tools: ToolSet = { ...resolvedTools, ...extraTools };
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      withActivityTracking(tool),
    ]),
  );
}

export const agentToolRegistry = toolRegistry;
