import type { NodeDisplayOptions } from "@/../convex/schemas/nodesSchema";
import {
  resolveNodeDisplayOptions,
  type ResolvedNodeDisplayOptions,
} from "@/components/nodes/prebuilt-nodes/nodeDisplayOptions";

/**
 * Les options d'affichage effectives d'un node, défauts du type et variante
 * courante appliqués. Seul accès depuis un composant : ne jamais lire
 * `xyNode.data.displayOptions` directement, une clé absente y vaut le défaut.
 *
 * Pas de mémo : le calcul est trivial, et `displayOptions` change de
 * référence à chaque sync Convex — un `useMemo` sur lui ne servirait jamais.
 */
export function useNodeDisplayOptions(xyNode: {
  type?: string;
  data: { variant?: unknown; displayOptions?: NodeDisplayOptions };
}): ResolvedNodeDisplayOptions {
  return resolveNodeDisplayOptions(
    xyNode.type,
    xyNode.data.variant as string | undefined,
    xyNode.data.displayOptions,
  );
}
