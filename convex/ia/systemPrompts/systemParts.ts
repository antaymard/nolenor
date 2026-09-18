import { getNodeCapabilities, nodeDataConfig } from "../../config/nodeConfig";

// Un type dont les capabilities coupent `agent.exposed` n'est pas présenté :
// l'agent ne peut ni le créer ni le reconnaître, autant qu'il n'en connaisse
// pas l'existence plutôt que d'en parler sans pouvoir agir.
//
// Un type présenté mais non `creatable` ne l'est pas PAR `create_node`, ce qui
// ne veut pas dire qu'aucune porte n'existe : une `frame` se crée par
// `group_nodes`, autour de nodes qui existent déjà. La ligne dit donc le fait
// mécanique — ce type n'est pas dans l'enum de `create_node` — et laisse la
// description du type nommer sa porte, s'il en a une. Dire « read-only » ici
// mentirait au modèle sur ce qu'il peut faire. Sans cette mention du tout, il
// lirait un catalogue de types créables et se prendrait un rejet zod qu'il ne
// peut pas anticiper.
const nodeTypesContext = nodeDataConfig
  .filter((item) => getNodeCapabilities(item.type).agent.exposed)
  .map((item) => {
    const notCreatable = getNodeCapabilities(item.type).agent.creatable
      ? ""
      : " (create_node does not accept this type)";
    return `- ${item.type}${notCreatable} : ${item.llmDescription}`;
  })
  .join("\n");

export const nodeTypesPresentation = `${nodeTypesContext}`;
