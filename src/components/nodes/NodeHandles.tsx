import { memo } from "react";
import { cn } from "@/lib/utils";
import { Handle, Position, useStore } from "@xyflow/react";

/**
 * Vrai tant qu'une connexion est en cours d'établissement.
 *
 * `useStore` et non `useConnection()` : ce dernier passe par un sélecteur qui
 * fait `{ ...s.connection }`, donc alloue un objet de onze champs — puis le
 * compare en surface — **à chaque tick du store**, c'est-à-dire à chaque frame
 * de pan, de zoom et de drag. Pour lire un seul booléen, et une fois par node.
 * Ici le sélecteur rend le booléen lui-même, comparé en `Object.is` : aucune
 * allocation.
 *
 * Passer un sélecteur à `useConnection` ne suffirait pas : il applique le
 * spread *avant* le sélecteur, donc l'allocation a lieu quand même.
 */
const connectionInProgressSelector = (state: {
  connection: { inProgress: boolean };
}) => state.connection.inProgress;

function NodeHandles({
  // hasDataHandles = false,
  showSourceHandles = false,
  nodeId,
}: {
  hasDataHandles?: boolean;
  showSourceHandles?: boolean;
  nodeId: string;
}) {
  const isConnecting = useStore(connectionInProgressSelector);

  const handles = [
    {
      type: "source" as const,
      position: Position.Left,
      visible: showSourceHandles,
      id: `${nodeId}_sl`,
    },
    {
      type: "source" as const,
      position: Position.Right,
      visible: showSourceHandles,
      id: `${nodeId}_sr`,
    },
    {
      type: "source" as const,
      position: Position.Top,
      visible: showSourceHandles,
      id: `${nodeId}_st`,
    },
    {
      type: "source" as const,
      position: Position.Bottom,
      visible: showSourceHandles,
      id: `${nodeId}_sb`,
    },
    {
      type: "target" as const,
      position: Position.Left,
      visible: isConnecting,
      id: `${nodeId}_tl`,
    },
    {
      type: "target" as const,
      position: Position.Right,
      visible: isConnecting,
      id: `${nodeId}_tr`,
    },
    {
      type: "target" as const,
      position: Position.Top,
      visible: isConnecting,
      id: `${nodeId}_tt`,
    },
    {
      type: "target" as const,
      position: Position.Bottom,
      visible: isConnecting,
      id: `${nodeId}_tb`,
    },
  ];

  return (
    <>
      {handles.map((handle) => (
        <Handle
          key={`${handle.type}-${handle.position}`}
          type={handle.type}
          id={handle.id}
          position={handle.position}
          className={cn(
            "transition-opacity duration-150 ease-out",
            handle.visible ? "opacity-100 z-10" : "opacity-0",
          )}
          style={{
            height: 10,
            width: 10,
            borderRadius: 999,
            background: handle.visible ? "#0f172a" : "transparent",
            border: "2px solid white",
            boxShadow: handle.visible
              ? "0 1px 4px rgba(15,23,42,0.3)"
              : "none",
          }}
        />
      ))}
    </>
  );

  // if (connection.inProgress) {
  //   return (
  //     <>
  //       <Handle type="target" className="z-10" position={Position.Left} />
  //     </>
  //   );
  // }

  return null;
}

// Props primitives (`nodeId`, `showSourceHandles`) : la comparaison par défaut
// suffit. `NodeFrame` re-rend à chaque rendu de son node — son propre `memo` ne
// mord pas, il reçoit `children` — donc sans ça les huit `<Handle>` seraient
// reconstruits pour rien à chaque fois.
export default memo(NodeHandles);
