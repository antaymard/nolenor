import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useStore, type ReactFlowState } from "@xyflow/react";
import usePresence from "@convex-dev/presence/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { makePresenceUserId } from "@/../convex/lib/presenceIds";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasPresenceStore } from "@/stores/canvasPresenceStore";
import { useWindowsStore, type OpenedWindow } from "@/stores/windowsStore";

// Tient la présence du canvas ouvert : heartbeat, liste des membres présents
// (versée dans `canvasPresenceStore`) et publication des nodes sur lesquels
// cet onglet est actif : sélectionnés, ou ouverts en window. Ne rend rien.
// Monté par `CanvasFlow`, sous le `ReactFlowProvider` dont il lit la
// sélection.

// Regroupe les changements rapprochés (lasso, clics enchaînés) : chaque
// publication réinvalide la liste de présence de toute la room.
const ACTIVITY_PUBLISH_DELAY_MS = 200;

// Clé par valeur : le sélecteur tourne à chaque changement du store React
// Flow (pan, drag…), seule une sélection différente doit re-rendre.
const selectedNodeIdsKeySelector = (state: ReactFlowState) =>
  state.nodes
    .filter((node) => node.selected)
    .map((node) => node.id)
    .join(",");

// Même principe côté windows : une window réduite n'est plus regardée, elle
// ne compte pas. Triée, pour qu'un changement de z-index ne republie rien.
const openNodeIdsKeySelector = (state: { openedWindows: OpenedWindow[] }) =>
  state.openedWindows
    .filter((opened) => opened.windowState !== "minimized")
    .map((opened) => opened.xyNodeId)
    .sort()
    .join(",");

const splitKey = (key: string) => (key ? key.split(",") : []);

const TAB_ID_STORAGE_KEY = "nolenor:presenceTabId";

/**
 * L'id de cet onglet pour la présence (cf. convex/lib/presenceIds.ts). Gardé
 * en `sessionStorage` : un rechargement du même onglet retrouve son
 * participant au lieu d'en créer un nouveau. Sans stockage disponible, un id
 * par montage — `pruneRoom` nettoie derrière.
 */
function readTabId(): string {
  try {
    const stored = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (stored) return stored;
    const tabId = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
    return tabId;
  } catch {
    return crypto.randomUUID();
  }
}

function PresenceSession({
  canvasId,
  myUserId,
}: {
  canvasId: Id<"canvases">;
  myUserId: string;
}) {
  const [tabId] = useState(readTabId);
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

  // Une fois par arrivée : les participants partis depuis longtemps sont
  // supprimés de la room (cf. `presence.pruneRoom`).
  const pruneRoom = useMutation(api.presence.pruneRoom);
  const hasPrunedRef = useRef(false);
  useEffect(() => {
    if (!isJoined || hasPrunedRef.current) return;
    hasPrunedRef.current = true;
    pruneRoom({ roomId: canvasId, userId: presenceUserId }).catch(
      (error: unknown) => {
        console.warn("[presence] prune failed", error);
      },
    );
  }, [isJoined, canvasId, presenceUserId, pruneRoom]);

  const selectedNodeIdsKey = useStore(selectedNodeIdsKeySelector);
  const openNodeIdsKey = useWindowsStore(openNodeIdsKeySelector);
  const updateActivity = useMutation(api.presence.updateActivity);
  useEffect(() => {
    if (!isJoined) return;
    const timeout = setTimeout(() => {
      updateActivity({
        roomId: canvasId,
        userId: presenceUserId,
        selectedNodeIds: splitKey(selectedNodeIdsKey),
        openNodeIds: splitKey(openNodeIdsKey),
      }).catch((error: unknown) => {
        // Sans conséquence au-delà de la pill chez les autres : le prochain
        // changement republie.
        console.warn("[presence] activity publish failed", error);
      });
    }, ACTIVITY_PUBLISH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [
    isJoined,
    selectedNodeIdsKey,
    openNodeIdsKey,
    canvasId,
    presenceUserId,
    updateActivity,
  ]);

  return null;
}

/**
 * Monte la présence seulement :
 * - pour un membre du canvas : le serveur refuse les autres (cf.
 *   convex/presence.ts), et le hook relancerait un heartbeat en échec toutes
 *   les dix secondes ;
 * - sur un canvas partagé : sans partage, seul son propriétaire y entre en
 *   membre, il n'y aurait personne à montrer. C'est le cas de l'immense
 *   majorité des canvas : ni heartbeat ni publication d'activité pour eux.
 *   Partager le canvas monte la présence aussitôt (`_isShared` est réactif).
 */
export default function CanvasPresenceSync({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const isEnabled = useCanvasStore(
    (state) =>
      state.canvas?._id === canvasId &&
      state.canvas._isMember === true &&
      state.canvas._isShared === true,
  );
  const me = useQuery(api.users.me, isEnabled ? {} : "skip");

  if (!isEnabled || !me) return null;

  // `key` : un changement de canvas repart d'une session neuve.
  return (
    <PresenceSession key={canvasId} canvasId={canvasId} myUserId={me._id} />
  );
}
