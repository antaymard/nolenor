import { nodeDataConfig } from "../../config/nodeConfig";

const nodeTypesContext = nodeDataConfig
  .map((item) => `- ${item.type} : ${item.llmDescription}`)
  .join("\n");

export const nodeTypesPresentation = `${nodeTypesContext}`;
