import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import usePresence, { type PresenceState } from "@convex-dev/presence/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  makePresenceUserId,
  parsePresenceUserId,
} from "@/../convex/lib/presenceIds";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";

// Facepile des AUTRES membres présents sur le canvas, à côté du statut de
// synchro. Soi-même n'y figure pas : on sait qu'on est là.

const MAX_VISIBLE = 3;

type Collaborator = {
  userId: string;
  name?: string;
  image?: string;
};

/**
 * Teinte stable par utilisateur : la même personne garde sa couleur d'un
 * onglet à l'autre, et plus tard sur ce qu'elle sélectionne.
 */
function hueForUser(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Un participant par utilisateur réel, quel que soit son nombre d'onglets. */
function otherCollaborators(
  states: PresenceState[],
  myUserId: string,
): Collaborator[] {
  const byUser = new Map<string, Collaborator>();
  for (const state of states) {
    if (!state.online) continue;
    const userId = parsePresenceUserId(state.userId);
    if (!userId || userId === myUserId || byUser.has(userId)) continue;
    byUser.set(userId, { userId, name: state.name, image: state.image });
  }
  return [...byUser.values()];
}

function Avatar({ collaborator }: { collaborator: Collaborator }) {
  const label = collaborator.name ?? "Someone";
  const initial = Array.from(label.trim())[0]?.toUpperCase() ?? "?";
  const hue = hueForUser(collaborator.userId);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="ring-surface flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white ring-2"
          style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
          aria-label={label}
        >
          {collaborator.image ? (
            <img
              src={collaborator.image}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initial
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PresenceFacepile({
  canvasId,
  myUserId,
}: {
  canvasId: Id<"canvases">;
  myUserId: string;
}) {
  // Un id par onglet (et par montage) : cf. convex/lib/presenceIds.ts.
  const [tabId] = useState(() => crypto.randomUUID());
  const states = usePresence(
    api.presence,
    canvasId,
    makePresenceUserId(myUserId, tabId),
  );

  const collaborators = useMemo(
    () => (states ? otherCollaborators(states, myUserId) : []),
    [states, myUserId],
  );

  if (collaborators.length === 0) return null;

  const visible = collaborators.slice(0, MAX_VISIBLE);
  const hidden = collaborators.slice(MAX_VISIBLE);

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((collaborator) => (
        <Avatar key={collaborator.userId} collaborator={collaborator} />
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ring-surface flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2">
              +{hidden.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {hidden.map((c) => c.name ?? "Someone").join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Monte la présence seulement pour un membre du canvas : le serveur refuse
 * les autres (cf. convex/presence.ts), et le hook relancerait un heartbeat
 * en échec toutes les dix secondes.
 */
function CanvasPresence() {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const isMember = useCanvasStore((state) => state.canvas?._isMember === true);
  const me = useQuery(api.users.me);

  if (!canvasId || !isMember || !me) return null;

  // `key` : un changement de canvas repart d'une session neuve.
  return <PresenceFacepile key={canvasId} canvasId={canvasId} myUserId={me._id} />;
}

export default memo(CanvasPresence);
