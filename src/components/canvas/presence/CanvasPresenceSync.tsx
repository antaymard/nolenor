import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useStore, type ReactFlowState } from "@xyflow/react";
import usePresence from "@convex-dev/presence/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { makePresenceUserId } from "@/../convex/lib/presenceIds";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasPresenceStore } from "@/stores/canvasPresenceStore";

// Tient la présence du canvas ouvert : heartbeat, liste des membres présents
// (versée dans `canvasPresenceStore`) et publication de la sélection locale.
// Ne rend rien. Monté par `CanvasFlow`, sous le `ReactFlowProvider` dont il
// lit la sélection.

// Regroupe les changements de sélection rapprochés (lasso, clics enchaînés) :
// chaque publication réinvalide la liste de présence de toute la room.
const SELECTION_PUBLISH_DELAY_MS = 200;

// Clé par valeur : le sélecteur tourne à chaque changement du store React
// Flow (pan, drag…), seule une sélection différente doit re-rendre.
const selectedNodeIdsKeySelector = (state: ReactFlowState) =>
  state.nodes
    .filter((node) => node.selected)
    .map((node) => node.id)
    .join(",");

function PresenceSession({
  canvasId,
  myUserId,
}: {
  canvasId: Id<"canvases">;
  myUserId: string;
}) {
  // Un id par onglet (et par montage) : cf. convex/lib/presenceIds.ts.
  const [tabId] = useState(() => crypto.randomUUID());
  const presenceUserId = makePresenceUserId(myUserId, tabId);
  const states = usePresence(api.presence, canvasId, presenceUserId);

  const setPresence = useCanvasPresenceStore((state) => state.setPresence);
  const reset = useCanvasPresenceStore((state) => state.reset);
  useEffect(() => {
    if (states) setPresence(states, myUserId);
  }, [states, myUserId, setPresence]);
  useEffect(() => reset, [reset]);

  // Le composant ignore une mise à jour de `data` tant que le premier
  // heartbeat n'a pas inscrit ce participant : on attend de se voir en ligne
  // dans la room, et on republie à chaque retour (onglet de nouveau visible).
  const isJoined =
    states?.some((s) => s.userId === presenceUserId && s.online) ?? false;

  const selectedNodeIdsKey = useStore(selectedNodeIdsKeySelector);
  const updateSelection = useMutation(api.presence.updateSelection);
  useEffect(() => {
    if (!isJoined) return;
    const timeout = setTimeout(() => {
      updateSelection({
        roomId: canvasId,
        userId: presenceUserId,
        selectedNodeIds: selectedNodeIdsKey
          ? selectedNodeIdsKey.split(",")
          : [],
      }).catch((error: unknown) => {
        // Sans conséquence au-delà de la pill chez les autres : la prochaine
        // sélection republie.
        console.warn("[presence] selection publish failed", error);
      });
    }, SELECTION_PUBLISH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isJoined, selectedNodeIdsKey, canvasId, presenceUserId, updateSelection]);

  return null;
}

/**
 * Monte la présence seulement pour un membre du canvas : le serveur refuse
 * les autres (cf. convex/presence.ts), et le hook relancerait un heartbeat
 * en échec toutes les dix secondes.
 */
export default function CanvasPresenceSync({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const isMember = useCanvasStore(
    (state) => state.canvas?._id === canvasId && state.canvas._isMember === true,
  );
  const me = useQuery(api.users.me);

  if (!isMember || !me) return null;

  // `key` : un changement de canvas repart d'une session neuve.
  return (
    <PresenceSession key={canvasId} canvasId={canvasId} myUserId={me._id} />
  );
}
