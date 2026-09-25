import type { Node } from "@xyflow/react";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import {
  NODE_DISPLAY_OPTIONS,
  getSupportedDisplayOptions,
  resolveNodeDisplayOptions,
} from "@/components/nodes/prebuilt-nodes/nodeDisplayOptions";
import type { NodeVariant } from "@/../convex/config/nodeConfig";
import type {
  NodeDisplayOptionKey,
  NodeDisplayOptions,
} from "@/../convex/schemas/nodesSchema";

export type AppearanceVariantEntry = {
  label: string;
  /** Pour chaque node visé, SA clé de variante et ses dimensions. */
  changes: Array<{ nodeId: string; variantKey: string; variant: NodeVariant }>;
};

export type AppearanceDisplayOptionEntry = {
  key: NodeDisplayOptionKey;
  label: string;
  /** Allumée sur TOUS les nodes visés. */
  checked: boolean;
};

export type AppearanceEntries = {
  variants: AppearanceVariantEntry[];
  displayOptions: AppearanceDisplayOptionEntry[];
};

/**
 * Ce que le sous-menu Appearance propose pour ces nodes, qu'il y en ait un
 * (menu d'un node) ou plusieurs (menu d'une sélection) :
 *
 * - les variantes que TOUS les types ont, appariées par libellé et non par
 *   clé — la même apparence (« Preview », « Title ») vit sous des clés
 *   différentes selon le type (`default` sur blocknote/table, `preview` sur
 *   app) ;
 * - les options d'affichage que TOUS les nodes proposent dans leur variante
 *   courante, cochées seulement si toute la sélection les a (sémantique
 *   « gras » des menus de sélection).
 */
export function getAppearanceEntries(nodes: Node[]): AppearanceEntries {
  if (nodes.length === 0) return { variants: [], displayOptions: [] };

  const variantsPerNode = nodes.map(
    (node) =>
      prebuiltNodesConfig.find((config) => config.node.type === node.type)
        ?.variants ?? {},
  );
  const labelsPerNode = variantsPerNode.map(
    (variants) =>
      new Map(Object.entries(variants).map(([key, v]) => [v.label, key])),
  );
  const variants = [...labelsPerNode[0].keys()]
    .filter((label) => labelsPerNode.every((labels) => labels.has(label)))
    .map((label) => ({
      label,
      changes: nodes.map((node, i) => {
        const variantKey = labelsPerNode[i].get(label) as string;
        return {
          nodeId: node.id,
          variantKey,
          variant: variantsPerNode[i][variantKey],
        };
      }),
    }));

  const stateOf = (node: Node) => ({
    type: node.type,
    variant: node.data?.variant as string | undefined,
    stored: node.data?.displayOptions as NodeDisplayOptions | undefined,
  });
  const [first, ...others] = nodes.map((node) => {
    const { type, variant } = stateOf(node);
    return getSupportedDisplayOptions(type, variant);
  });
  const displayOptions = first
    .filter((key) => others.every((supported) => supported.includes(key)))
    .map((key) => ({
      key,
      label: NODE_DISPLAY_OPTIONS[key].label,
      checked: nodes.every((node) => {
        const { type, variant, stored } = stateOf(node);
        return resolveNodeDisplayOptions(type, variant, stored)[key];
      }),
    }));

  return { variants, displayOptions };
}
