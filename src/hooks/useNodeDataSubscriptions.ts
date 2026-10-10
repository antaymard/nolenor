import { useEffect, useMemo } from "react";
import { useQueries } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { getNodeDataDoc, rememberNodeDataDocs } from "@/lib/canvasDocCache";
import { useNodeDataStore } from "@/stores/nodeDataStore";

/**
 * Une query réactive `nodeDatas.read` par node vivant du canvas, versées dans
 * `nodeDataStore`.
 *
 * Remplace la query unique `nodeDatas.listByCanvasId` : celle-ci dépendait de
 * tous les nodeDatas du canvas, donc la moindre écriture de contenu (une
 * cellule, la recopie BlockNote, le `state` d'une app) la relançait, et elle
 * relisait puis renvoyait le canvas entier. Ici une écriture ne relance que la
 * query de SON nodeData : un doc relu, un doc renvoyé. Toutes les queries
 * passent par la même websocket ; quelques centaines par canvas restent un
 * usage normal de Convex.
 *
 * Ne dépend que des nodes vivants (`nodes.listFromCanvas`) : la corbeille est
 * écartée d'office, sans filtre.
 *
 * Pendant qu'une query charge, le node garde ce qu'on sait déjà de lui, dans
 * cet ordre : la valeur du store, le dernier doc serveur connu
 * (`canvasDocCache`, pour une restauration depuis la corbeille), puis le doc
 * factice de sa création local-first, ré-keyé sur le vrai id. Sans quoi son
 * contenu clignoterait le temps d'un aller-retour.
 */
export function useNodeDataSubscriptions(
  tableNodes: readonly Doc<"nodes">[] | undefined,
): { isLoading: boolean; isError: boolean; error: Error | undefined } {
  const setNodeDatas = useNodeDataStore((state) => state.setNodeDatas);
  const removePendingNodeData = useNodeDataStore(
    (state) => state.removePendingNodeData,
  );
  const pendingNodeDatas = useNodeDataStore((state) => state.pendingNodeDatas);

  // Clé stable : `tableNodes` change à chaque drag, l'ensemble des nodeDatas
  // non. Sans elle, `useQueries` recevrait un objet neuf à chaque frame.
  const idsKey = useMemo(
    () =>
      tableNodes === undefined
        ? undefined
        : [...new Set(tableNodes.map((node) => node.nodeDataId))]
            .sort()
            .join(","),
    [tableNodes],
  );

  const queries = useMemo(() => {
    if (!idsKey) return {};
    return Object.fromEntries(
      idsKey.split(",").map((nodeDataId) => [
        nodeDataId,
        {
          query: api.nodeDatas.read,
          args: { nodeDataId: nodeDataId as Id<"nodeDatas"> },
        },
      ]),
    );
  }, [idsKey]);

  const results = useQueries(queries) as Record<
    string,
    Doc<"nodeDatas"> | null | undefined | Error
  >;

  const error = useMemo(
    () =>
      Object.values(results).find(
        (result): result is Error => result instanceof Error,
      ),
    [results],
  );

  // Chargement initial : la liste des nodes ou au moins une query encore en
  // vol. Une query en erreur compte comme répondue, `error` la porte.
  const isLoading = useMemo(
    () =>
      idsKey === undefined ||
      Object.values(results).some((result) => result === undefined),
    [idsKey, results],
  );

  useEffect(() => {
    if (tableNodes === undefined) return;
    const current = useNodeDataStore.getState().nodeDatas;
    const docs: Doc<"nodeDatas">[] = [];
    const loaded: Doc<"nodeDatas">[] = [];
    const resolvedPending: string[] = [];

    for (const node of tableNodes) {
      const result = results[node.nodeDataId];
      if (result instanceof Error || result === null) continue;
      if (result !== undefined) {
        docs.push(result);
        loaded.push(result);
        if (pendingNodeDatas.has(node.id)) resolvedPending.push(node.id);
        continue;
      }
      const pending = pendingNodeDatas.get(node.id);
      const fallback =
        current.get(node.nodeDataId) ??
        getNodeDataDoc(node.nodeDataId) ??
        (pending && { ...pending, _id: node.nodeDataId });
      if (fallback) docs.push(fallback);
    }

    // Les créations en vol, sous leur id factice : le node local les
    // référence ainsi tant que la mutation n'a pas répondu.
    for (const [nodeId, pending] of pendingNodeDatas) {
      if (!resolvedPending.includes(nodeId)) docs.push(pending);
    }

    rememberNodeDataDocs(loaded);
    setNodeDatas(docs);
    for (const nodeId of resolvedPending) removePendingNodeData(nodeId);
  }, [tableNodes, results, pendingNodeDatas, setNodeDatas, removePendingNodeData]);

  return { isLoading, isError: error !== undefined, error };
}
