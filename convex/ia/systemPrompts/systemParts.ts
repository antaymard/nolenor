import { getNodeCapabilities, nodeDataConfig } from "../../config/nodeConfig";

// Un type dont les capabilities coupent `agent.exposed` n'est pas présenté :
// l'agent ne peut ni le créer ni le reconnaître, autant qu'il n'en connaisse
// pas l'existence plutôt que d'en parler sans pouvoir agir.
//
// Un type présenté mais non `creatable` (une `frame` : l'agent en croise dans
// `list_nodes` et dans la minimap, mais seul l'utilisateur en trace) le dit
// dans sa ligne. Sans cette mention, le modèle lit un catalogue de types
// créables et se prend un rejet zod de `create_node` qu'il ne peut pas
// anticiper.
const nodeTypesContext = nodeDataConfig
  .filter((item) => getNodeCapabilities(item.type).agent.exposed)
  .map((item) => {
    const readOnly = getNodeCapabilities(item.type).agent.creatable
      ? ""
      : " (read-only: you cannot create this type)";
    return `- ${item.type}${readOnly} : ${item.llmDescription}`;
  })
  .join("\n");

export const nodeTypesPresentation = `${nodeTypesContext}`;
