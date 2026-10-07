import { useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { Collaborator } from "@/stores/canvasPresenceStore";

/** Les autres membres en ligne sur un canvas, par canvas. */
export type PresenceByCanvas = ReadonlyMap<Id<"canvases">, Collaborator[]>;

const EMPTY: PresenceByCanvas = new Map();

function sameCollaborators(a: Collaborator[], b: Collaborator[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (c, i) =>
        c.userId === b[i].userId &&
        c.name === b[i].name &&
        c.image === b[i].image,
    )
  );
}

/**
 * Qui est en ce moment sur chacun de mes canvas (home). Une seule query pour
 * toute la page, comme les tâches : elle ne renvoie que les canvas où il y a
 * quelqu'un.
 *
 * La query se rejoue à chaque changement de présence sur l'un de ces canvas
 * (une sélection comprise) et renvoie alors des tableaux neufs. Un canvas
 * dont les présents n'ont pas changé garde son tableau précédent : sa carte,
 * mémoïsée, ne se redessine pas.
 */
export function useCanvasesPresence(): PresenceByCanvas {
  const rooms = useQuery(api.presence.listMyCanvases);
  const previousRef = useRef<PresenceByCanvas>(EMPTY);

  return useMemo(() => {
    if (!rooms) return previousRef.current;
    const previous = previousRef.current;
    const next = new Map<Id<"canvases">, Collaborator[]>();
    for (const { canvasId, collaborators } of rooms) {
      const kept = previous.get(canvasId);
      next.set(
        canvasId,
        kept && sameCollaborators(kept, collaborators) ? kept : collaborators,
      );
    }
    previousRef.current = next;
    return next;
  }, [rooms]);
}
