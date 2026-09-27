import { useCallback, useEffect } from "react";
import {
  applyEdgeChanges,
  useEdgesState,
  type Edge,
  type EdgeChange,
  type EdgeAddChange,
} from "@xyflow/react";

export function useCanvasEdges(canvasEdges?: Edge[]) {
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync convex -> reactflow edges while preserving selection.
  // Sans ça, le moindre push (`data` d'une autre edge, bypass optimiste)
  // éteignait le halo de `CustomEdge` — y compris celui qu'on vient
  // d'allumer au clic droit dans `useContextMenu`. Même patron que les nodes
  // (`useCanvasNodes`), en plus simple : la sélection d'edges n'est que
  // locale, jamais persistée.
  useEffect(() => {
    if (canvasEdges !== undefined) {
      if (canvasEdges.length === 0) {
        setEdges([]);
        return;
      }
      // Partage structurel : Convex rend des objets neufs pour TOUTES les
      // edges à chaque mise à jour de la query, même quand une seule a changé.
      // Une edge dont le contenu est identique garde l'objet qu'on a déjà —
      // sélection comprise — et React Flow ne la re-rend pas. Sans ça, chaque
      // push (un drop, une édition, un collaborateur, Nolë) re-rendait toutes
      // les edges du canvas : un gel de plusieurs dizaines de millisecondes sur
      // un canvas chargé.
      setEdges((current) => {
        const currentById = new Map(current.map((edge) => [edge.id, edge]));
        let changed = current.length !== canvasEdges.length;
        const next = canvasEdges.map((incoming, index) => {
          const existing = currentById.get(incoming.id);
          if (existing && isSameEdge(existing, incoming)) {
            if (current[index] !== existing) changed = true;
            return existing;
          }
          changed = true;
          return existing?.selected
            ? { ...incoming, selected: true }
            : incoming;
        });
        return changed ? next : current;
      });
    }
  }, [canvasEdges, setEdges]);
  const handleEdgeChange = useCallback(
    (changes: EdgeChange[]) => {
      // Un node ne peut pas être connecté à lui-même : on ignore les
      // auto-connexions pour ne ni les afficher ni les persister.
      const filteredChanges = changes.filter(
        (change) =>
          change.type !== "add" || change.item.source !== change.item.target,
      );
      if (filteredChanges.length === 0) {
        return;
      }

      const addedChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type === "add",
      ) as EdgeAddChange[];
      const otherChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type !== "add",
      );

      // ADD EDGES — persistée en amont par `useCreateEdge` (onConnect) : le
      // change arrive déjà avec l'id serveur, rien à envoyer ici.
      //
      // Updater fonctionnel avec garde anti-doublon : le push Convex de
      // `edges.listFromCanvas` peut livrer l'edge (même llmId) AVANT l'add
      // local qui suit la réponse de mutation. Sans garde, l'array porte
      // deux fois le même id, React Flow rend deux `CustomEdge` sous la
      // même key, et leur label editor se referme aussitôt — le second
      // autofocus vole le focus du premier, blur → commit → fermeture.
      if (addedChanges.length > 0) {
        setEdges((current) => {
          const existing = new Set(current.map((edge) => edge.id));
          const toAdd = addedChanges.filter(
            (change) => !existing.has(change.item.id),
          );
          if (toAdd.length === 0) return current;
          return applyEdgeChanges(toAdd, current);
        });
      }

      if (otherChanges.length > 0) {
        onEdgesChange(otherChanges);
      }

      // REMOVE EDGES — appliquée localement par `onEdgesChange` ci-dessus,
      // persistée par `useDeleteCanvasElements` (une transaction avec les
      // nodes supprimés en même temps).
    },
    [onEdgesChange, setEdges],
  );

  return {
    edges,
    setEdges,
    handleEdgeChange,
  };
}

/**
 * Même contenu, à la sélection près (état local, jamais renvoyé par Convex).
 */
function isSameEdge(existing: Edge, incoming: Edge): boolean {
  const { selected: _selected, ...rest } = existing;
  return isSameJsonValue(rest, incoming);
}

/**
 * Égalité profonde de valeurs JSON (ce que renvoie Convex). Une clé à
 * `undefined` vaut une clé absente, comme après un aller-retour JSON.
 */
function isSameJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return (
      a.length === other.length &&
      a.every((item, index) => isSameJsonValue(item, other[index]))
    );
  }
  const aEntries = Object.entries(a).filter(([, v]) => v !== undefined);
  const bObject = b as Record<string, unknown>;
  const bKeys = Object.keys(bObject).filter((k) => bObject[k] !== undefined);
  return (
    aEntries.length === bKeys.length &&
    aEntries.every(([key, value]) => isSameJsonValue(value, bObject[key]))
  );
}
