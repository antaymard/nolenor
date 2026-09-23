import type { Node } from "@xyflow/react";
import {
  NODE_DISPLAY_OPTIONS,
  getSupportedDisplayOptions,
  resolveNodeDisplayOptions,
} from "@/../convex/config/nodeConfig";
import type {
  NodeDisplayOptionKey,
  NodeDisplayOptions,
} from "@/../convex/schemas/nodesSchema";

export type DisplayOptionMenuEntry = {
  key: NodeDisplayOptionKey;
  label: string;
  /** Allumée sur TOUS les nodes visés. */
  checked: boolean;
};

/**
 * Les options d'affichage qu'un menu peut proposer pour ces nodes : celles
 * que TOUS leurs types proposent (même règle que les variants communs d'une
 * sélection), avec leur état. `checked` suit la sémantique « gras » des menus
 * de sélection : cochée seulement si toute la sélection l'a.
 */
export function getCommonDisplayOptions(
  nodes: Node[],
): DisplayOptionMenuEntry[] {
  if (nodes.length === 0) return [];

  const [first, ...others] = nodes.map((node) =>
    getSupportedDisplayOptions(node.type ?? ""),
  );
  const common = first.filter((key) =>
    others.every((supported) => supported.includes(key)),
  );

  return common.map((key) => ({
    key,
    label: NODE_DISPLAY_OPTIONS[key].label,
    checked: nodes.every(
      (node) =>
        resolveNodeDisplayOptions(
          node.type,
          node.data?.displayOptions as NodeDisplayOptions | undefined,
        )[key],
    ),
  }));
}
