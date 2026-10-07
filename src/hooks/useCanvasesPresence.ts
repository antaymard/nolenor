import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { Collaborator } from "@/stores/canvasPresenceStore";

/** Les autres membres en ligne sur un canvas, par canvas. */
export type PresenceByCanvas = ReadonlyMap<Id<"canvases">, Collaborator[]>;

const EMPTY: PresenceByCanvas = new Map();

/**
 * Qui est en ce moment sur chacun de mes canvas (home). Une seule query pour
 * toute la page, comme les tâches : elle ne renvoie que les canvas où il y a
 * quelqu'un.
 */
export function useCanvasesPresence(): PresenceByCanvas {
  const rooms = useQuery(api.presence.listMyCanvases);
  return useMemo(
    () =>
      rooms
        ? new Map(rooms.map((room) => [room.canvasId, room.collaborators]))
        : EMPTY,
    [rooms],
  );
}
