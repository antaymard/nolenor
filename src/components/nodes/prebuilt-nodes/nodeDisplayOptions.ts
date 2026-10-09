import type { NodeType } from "@/types/domain";
import type {
  NodeDisplayOptionKey,
  NodeDisplayOptions,
} from "@/../convex/schemas/nodesSchema";

/**
 * Les options d'affichage des nodes prébuilts : réglages cumulables, portés
 * par la ligne `nodes` (`displayOptions`) et indépendants de la variante.
 *
 * Ajouter une option :
 * 1. son champ dans `nodeDisplayOptionsValidator`
 *    (`convex/schemas/nodesSchema.ts`) — c'est tout ce que le backend voit ;
 * 2. son libellé dans `NODE_DISPLAY_OPTIONS` ci-dessous (l'oubli casse la
 *    compilation) ;
 * 3. les types qui la proposent, et leur défaut, dans
 *    `NODE_TYPE_DISPLAY_OPTIONS` ;
 * 4. son rendu : dans `NodeFrame` si elle vaut pour n'importe quel node,
 *    sinon dans le composant du node, via `useNodeDisplayOptions`.
 * Rien d'autre : stockage, undo, optimiste, duplication, memo et menu
 * Appearance sont génériques.
 *
 * Config purement front : le backend stocke les valeurs (le validator de
 * `convex/schemas/nodesSchema.ts` en borne les clés et les types) mais n'en
 * lit aucune. Tout ce qui décide de leur sens et de leur défaut vit donc ici.
 *
 * Fichier sans import de composant, comme `nodeOpenability.ts` et pour la
 * même raison : `prebuiltNodesConfig.ts` importe les composants de node, qui
 * lisent eux-mêmes ces options — passer par lui fermerait un cycle.
 */

/**
 * Ce que chaque option SIGNIFIE, une fois pour tous les types.
 *
 * `Record` exhaustif : une clé ajoutée à `nodeDisplayOptionsValidator` sans
 * entrée ici casse la compilation. L'ordre est celui du menu Appearance.
 */
export const NODE_DISPLAY_OPTIONS: Record<
  NodeDisplayOptionKey,
  { label: string }
> = {
  showTitle: { label: "Show title" },
  scaleWithZoom: { label: "Scale with zoom" },
};

const NODE_DISPLAY_OPTION_KEYS = Object.keys(
  NODE_DISPLAY_OPTIONS,
) as NodeDisplayOptionKey[];

export type NodeDisplayOptionConfig = {
  /**
   * La valeur d'un node qui n'a rien stocké pour cette option. Lue à chaque
   * rendu, pas figée à la création : la changer change aussi l'affichage des
   * nodes qui n'y ont jamais touché.
   */
  default: boolean;
  /**
   * Les variantes où l'option n'a pas de sens (un bandeau d'une ligne n'a pas
   * de place pour un en-tête). Elle y vaut `false` et sort du menu, mais sa
   * valeur stockée survit : on la retrouve en changeant de variante.
   *
   * Une exclusion et non une liste de variantes permises : beaucoup de nodes
   * portent `variant: "default"` même quand leur type n'a pas de clé de ce
   * nom (cf. `useCreateNode`), et doivent se comporter comme la variante par
   * défaut.
   */
  hiddenInVariants?: string[];
};

export type NodeTypeDisplayOptions = Partial<
  Record<NodeDisplayOptionKey, NodeDisplayOptionConfig>
>;

/** Les options que chaque type propose. Un type absent n'en propose aucune. */
export const NODE_TYPE_DISPLAY_OPTIONS: Partial<
  Record<NodeType, NodeTypeDisplayOptions>
> = {
  image: {
    showTitle: { default: false },
  },
  title: {
    // Un titre de section doit se lire de loin, comme celui d'une frame.
    // `false` : les titres existants ne changent pas d'aspect.
    scaleWithZoom: { default: false },
  },
  frame: {
    // Porte sur le TITRE de la frame, pas sur sa boîte : une frame est une
    // zone du canvas, elle garde sa taille monde. `true` : c'est le
    // comportement que les titres de frame ont toujours eu. La carte compacte
    // n'a pas de titre flottant.
    scaleWithZoom: { default: true, hiddenInVariants: ["compact"] },
  },
  app: {
    // `true` : c'est l'en-tête que la variante preview a toujours eu, les
    // apps existantes n'en perdent pas. Le décocher donne toute la hauteur à
    // l'iframe.
    showTitle: { default: true, hiddenInVariants: ["title"] },
  },
};

export type ResolvedNodeDisplayOptions = Record<NodeDisplayOptionKey, boolean>;

function getOptionConfig(
  nodeType: string | undefined,
  variant: string | undefined,
  key: NodeDisplayOptionKey,
): NodeDisplayOptionConfig | undefined {
  if (!nodeType) return undefined;
  const config = NODE_TYPE_DISPLAY_OPTIONS[nodeType as NodeType]?.[key];
  if (!config) return undefined;
  if (variant !== undefined && config.hiddenInVariants?.includes(variant)) {
    return undefined;
  }
  return config;
}

/**
 * Les options qu'un node propose dans son état courant (type ET variante),
 * dans l'ordre du catalogue.
 */
export function getSupportedDisplayOptions(
  nodeType: string | undefined,
  variant: string | undefined,
): NodeDisplayOptionKey[] {
  return NODE_DISPLAY_OPTION_KEYS.filter(
    (key) => getOptionConfig(nodeType, variant, key) !== undefined,
  );
}

/**
 * Les options d'affichage effectives d'un node : la valeur stockée, sinon le
 * défaut du type. Une option que le type (ou sa variante) ne propose pas vaut
 * `false`, même si une valeur traîne en base — retirer une option d'un type ne
 * demande donc aucune migration.
 *
 * Depuis un composant, passer par `useNodeDisplayOptions`.
 */
export function resolveNodeDisplayOptions(
  nodeType: string | undefined,
  variant: string | undefined,
  stored: NodeDisplayOptions | undefined,
): ResolvedNodeDisplayOptions {
  return Object.fromEntries(
    NODE_DISPLAY_OPTION_KEYS.map((key) => {
      const config = getOptionConfig(nodeType, variant, key);
      return [key, config ? (stored?.[key] ?? config.default) : false];
    }),
  ) as ResolvedNodeDisplayOptions;
}

/**
 * Ce que les helpers ci-dessous lisent d'un node : React Flow (`XyNode`,
 * `NodeProps`, snapshot d'undo) ou n'importe quel objet de même forme.
 */
type NodeLike = { type?: string; data?: Record<string, unknown> };

function readNode(node: NodeLike) {
  return {
    type: node.type,
    variant: node.data?.variant as string | undefined,
    stored: node.data?.displayOptions as NodeDisplayOptions | undefined,
  };
}

/** `resolveNodeDisplayOptions`, lu directement sur un node React Flow. */
export function resolveDisplayOptionsOfNode(
  node: NodeLike,
): ResolvedNodeDisplayOptions {
  const { type, variant, stored } = readNode(node);
  return resolveNodeDisplayOptions(type, variant, stored);
}

/** `getSupportedDisplayOptions`, lu directement sur un node React Flow. */
export function getSupportedDisplayOptionsOfNode(
  node: NodeLike,
): NodeDisplayOptionKey[] {
  const { type, variant } = readNode(node);
  return getSupportedDisplayOptions(type, variant);
}
