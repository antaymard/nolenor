import { useCallback } from "react";
import { useStore } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";

/**
 * Le minimum pour reconnaître un node : son id React Flow, et le `nodeDataId`
 * dans l'un ou l'autre de ses deux domiciles.
 *
 * Deux domiciles, parce que l'id est stocké au premier niveau du node de canvas
 * (`canvasesSchema.ts`, optionnel) et dupliqué dans la charge React Flow
 * (`XyNodeData`, requis). Les call sites lisent presque tous le second — ce
 * helper accepte les deux pour de bon, plutôt que de reposer sur le fait que la
 * duplication soit toujours à jour.
 */
type NodeIdentityLike = {
  id?: string;
  nodeDataId?: Id<"nodeDatas"> | null;
  data?: Record<string, unknown> | null;
};

/** Le `nodeDataId` d'un node, quel que soit le domicile où il se trouve. */
export function getNodeDataId(
  node: NodeIdentityLike | null | undefined,
): Id<"nodeDatas"> | undefined {
  if (!node) return undefined;
  if (node.nodeDataId) return node.nodeDataId;
  const fromData = node.data?.nodeDataId;
  return typeof fromData === "string"
    ? (fromData as Id<"nodeDatas">)
    : undefined;
}

/**
 * Le `nodeDataId` d'un node désigné par son id React Flow.
 *
 * Sélecteur ciblé plutôt qu'un `useStore((s) => s.nodes)` suivi d'un `.find()`
 * dans le corps du composant : `state.nodes` change de référence à chaque frame
 * de drag, donc chaque instance se re-rendait et rebalayait la liste — O(N×M)
 * par frame pour M cartes de mention ou M cellules `node`. Ici le sélecteur
 * rend une chaîne, stable tant que ce node précis ne change pas.
 */
export function useNodeDataIdOf(
  nodeId: string | undefined,
): Id<"nodeDatas"> | undefined {
  return useStore(
    useCallback(
      (state) => {
        if (!nodeId) return undefined;
        return getNodeDataId(
          state.nodes.find((node) => node.id === nodeId) as NodeIdentityLike,
        );
      },
      [nodeId],
    ),
  );
}

/**
 * Deux Sets portent-ils les mêmes éléments ?
 *
 * Même rôle que `haveSameEntries` ci-dessous, pour `useExistingNodeIds`.
 */
function haveSameMembers<T>(a: Set<T>, b: Set<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/**
 * Les ids React Flow de tous les nodes vivants du canvas.
 *
 * Rend un `Set` — les appelants ne font que des tests d'appartenance — et,
 * surtout, passe par `haveSameMembers`. Sans comparateur, le sélecteur rendrait
 * une collection neuve à chaque tick du store et l'appelant se re-rendrait à
 * **chaque frame de pan et de drag** : c'était le cas de `WindowsContainer`
 * (qui re-rendait alors toutes les fenêtres ouvertes) et de
 * `MinimizedWindowsStack`, tous deux sur un `state.nodes.map((n) => n.id)` nu.
 */
export function useExistingNodeIds(): ReadonlySet<string> {
  return useStore(
    useCallback((state) => new Set(state.nodes.map((node) => node.id)), []),
    haveSameMembers,
  );
}

/**
 * Deux Maps portent-elles les mêmes correspondances ?
 *
 * Le sélecteur ci-dessous rend une Map neuve à chaque tick du store : sans
 * cette comparaison, l'appelant se re-rendrait à chaque frame de pan.
 */
function haveSameEntries<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

/**
 * La correspondance `nodeDataId` → id React Flow, pour tout le canvas.
 *
 * Les absents ne sont pas dans la Map : un node supprimé depuis que le thread
 * l'a touché n'est plus navigable, et c'est à l'appelant d'en tirer les
 * conséquences — comme `MinimizedWindowsStack` le fait avec
 * `useExistingNodeIds`.
 *
 * Le sélecteur s'exécute à chaque tick du store React Flow — donc à chaque
 * frame de pan, de zoom et de drag, pas seulement quand la correspondance
 * change. D'où deux choix : il construit une Map plutôt que de sérialiser
 * (aucun échappement, aucun `JSON.parse` au retour, et plus de question de
 * séparateur dans des ids qui sont des chaînes libres), et c'est
 * `haveSameEntries` qui décide s'il y a lieu de re-rendre.
 */
export function useNodeIdsByDataId(): Map<Id<"nodeDatas">, string> {
  return useStore(
    useCallback((state) => {
      const byDataId = new Map<Id<"nodeDatas">, string>();
      for (const node of state.nodes) {
        const dataId = getNodeDataId(node as NodeIdentityLike);
        if (dataId) byDataId.set(dataId, node.id);
      }
      return byDataId;
    }, []),
    haveSameEntries,
  );
}
