import type { ToolSet } from "ai";
import type { ToolCtx } from "@convex-dev/agent";
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
import { type ToolConfig } from "./toolHelpers";
import { websearchTool, websearchToolConfig } from "./websearchTool";
import runSubAgent, { runSubAgentConfig } from "./runSubAgentTool";
import listUserCanvasesTool, {
  listUserCanvasesToolConfig,
} from "./listUserCanvasesTool";

type AgentTool = ToolSet[string];
type ToolExecute = NonNullable<AgentTool["execute"]>;

/**
 * Ce que le composant agent pose sur le tool au moment de l'appel.
 *
 * `createTool` ne garde pas le ctx à la définition : `wrapTools` recopie chaque
 * tool en y ajoutant `ctx` juste avant la génération, et l'`execute` du
 * composant le relit sur `this`. C'est pour ça que l'enveloppe ci-dessous est
 * une `function` et non une arrow, et qu'elle délègue avec `.call(this, …)` :
 * une arrow perdrait `this`, et TOUS les tools throwraient « you must provide
 * the ctx ».
 */
type ToolThis = { ctx?: ToolCtx };

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
 * Attendue, et non lancée en fond : une action Convex qui se termine emporte ses
 * promesses en vol, et celle qu'on perdrait serait justement la dernière du tour
 * — celle qui reste affichée. Le coût est un aller-retour de mutation par tool
 * call, négligeable devant le step LLM qui vient de le décider.
 *
 * N'échoue jamais : c'est une trace, elle n'a pas à faire tomber le travail
 * qu'elle décrit.
 */
async function recordActivity(toolThis: unknown, input: unknown): Promise<void> {
  const ctx = (toolThis as ToolThis | undefined)?.ctx;
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

/**
 * Enveloppe un tool pour tracer son étiquette avant de l'exécuter.
 *
 * Ici et non dans chaque tool : les vingt tools partagent déjà
 * `EXPLANATION_FIELD`, et leur demander un appel de traçage de plus serait vingt
 * occasions de l'oublier — à commencer par le prochain tool écrit.
 *
 * Les tools sans `execute` (tools déclaratifs, à sortie fournie par le provider)
 * passent inchangés.
 */
function withActivityTracking(tool: AgentTool): AgentTool {
  const execute = tool.execute;
  if (typeof execute !== "function") return tool;

  const tracked: ToolExecute = async function (this: unknown, input, options) {
    await recordActivity(this, input);
    return execute.call(this, input, options);
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
    config: runSubAgentConfig,
    factory: ({ threadCtx }) => runSubAgent({ threadCtx }),
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
