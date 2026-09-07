import { getNodeCapabilities, nodeDataConfig } from "../../config/nodeConfig";

// Un type dont les capabilities coupent `agent.exposed` n'est pas présenté :
// l'agent ne peut ni le créer ni le reconnaître, autant qu'il n'en connaisse
// pas l'existence plutôt que d'en parler sans pouvoir agir.
const nodeTypesContext = nodeDataConfig
  .filter((item) => getNodeCapabilities(item.type).agent.exposed)
  .map((item) => `- ${item.type} : ${item.llmDescription}`)
  .join("\n");

export const nodeTypesPresentation = `${nodeTypesContext}`;
