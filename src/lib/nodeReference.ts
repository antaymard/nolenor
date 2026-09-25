// Référence textuelle à un ou plusieurs nodes, à coller à un agent extérieur
// qui lira le canvas via le serveur MCP. Les clés reprennent le nom des
// arguments des tools MCP (`canvasId`, `nodeIds` de `read_nodes`) pour que
// l'agent les passe tels quels, sans avoir à deviner la correspondance.
//
//   nodeId:abc
//   nodeIds:abc,def
//   canvasId:xyz|nodeId:abc
//   canvasId:xyz|nodeIds:abc,def

export function formatNodeReference({
  nodeIds,
  canvasId,
}: {
  nodeIds: string[];
  canvasId?: string;
}): string {
  const nodePart =
    nodeIds.length === 1
      ? `nodeId:${nodeIds[0]}`
      : `nodeIds:${nodeIds.join(",")}`;
  return canvasId ? `canvasId:${canvasId}|${nodePart}` : nodePart;
}
