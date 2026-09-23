import { useMemo, useState } from "react";
import { TbLocation, TbX } from "react-icons/tb";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import TargetDeltaIndicator from "@/components/canvas/navigation/TargetDeltaIndicator";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import type { DeltaTarget } from "@/lib/canvasViewportFraming";
import { useExistingNodeIds } from "@/lib/nodeIdentity";
import { useWindowsStore, type OpenedWindow } from "@/stores/windowsStore";
import { DockHoverActions } from "./DockRow";

/**
 * Au-delà, la rangée filerait vers `CanvasToolbar`, en `bottom-center`. Le
 * reste passe derrière un « +N », comme dans `ActivityDock`.
 */
const MAX_VISIBLE_PILLS = 3;

/**
 * Une window minimisée : titre, et cap + distance vers son node — remplacés
 * au survol par « Go to » et « Close ». Un clic ailleurs la restaure.
 *
 * Le titre et l'icône viennent du nodeData et pas de la window : une window
 * reste ouverte pendant qu'on édite son node, et son libellé doit suivre.
 */
function MinimizedPill({ window: openedWindow }: { window: OpenedWindow }) {
  const toggleMinimizeWindow = useWindowsStore((s) => s.toggleMinimizeWindow);
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const goToNode = useGoToNode();

  const title = useNodeDataTitle(openedWindow.nodeDataId) ?? "—";
  const nodeData = useNodeData(openedWindow.nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  // `useMemo` : `useTargetDelta` compare sa cible par `Object.is`, un littéral
  // frais re-rendrait à chaque frame de pan.
  const deltaTarget = useMemo<DeltaTarget>(
    () => ({ nodeId: openedWindow.xyNodeId }),
    [openedWindow.xyNodeId],
  );

  return (
    // `max-w-48` : une pastille, pas une barre d'onglets — un titre long se
    // tronque plutôt que d'étirer la rangée vers le centre.
    <div className="canvas-ui-container group animate-appear-up max-w-48 gap-0! px-0!">
      <button
        type="button"
        onClick={() => toggleMinimizeWindow(openedWindow.xyNodeId)}
        // Clic milieu : ferme la window sans la restaurer. Le réflexe des
        // onglets de navigateur.
        onMouseDown={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          closeWindow(openedWindow.xyNodeId);
        }}
        title={title}
        className="flex h-10 min-w-0 flex-1 items-center gap-2 pr-1 pl-3 text-left"
      >
        {NodeIcon ? (
          <NodeIcon size={15} className="shrink-0 text-muted-foreground" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
          {title}
        </span>
      </button>
      <DockHoverActions
        indicator={<TargetDeltaIndicator target={deltaTarget} />}
        actions={[
          {
            icon: TbLocation,
            label: "Go to node",
            onClick: () => goToNode(openedWindow.xyNodeId),
          },
          {
            icon: TbX,
            label: "Close window",
            destructive: true,
            onClick: () => closeWindow(openedWindow.xyNodeId),
          },
        ]}
      />
    </div>
  );
}

/**
 * Les windows minimisées, en pastilles à gauche du bouton des repères.
 *
 * Le pendant de `ActivityDock` en bas à gauche : là-bas les tâches partent du
 * bouton Nolë vers la droite, ici les windows partent du bord droit vers le
 * centre (`flex-row-reverse` : la première est collée au bouton). Trois au
 * plus, le reste derrière un « +N ». Pas de réordonnancement : leur ordre
 * n'est stocké nulle part.
 *
 * Ne se rend pas à vide. Une pastille qui apparaît dit à elle seule où la
 * window est partie ; quand elle file dans le « +N », c'est lui qui pulse.
 */
export default function MinimizedDock() {
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const closeAllMinimizedWindows = useWindowsStore(
    (s) => s.closeAllMinimizedWindows,
  );
  const existingNodeIds = useExistingNodeIds();
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Une window dont le node a été supprimé ne s'affiche pas.
  const minimized = useMemo(
    () =>
      openedWindows.filter(
        (w) => w.windowState === "minimized" && existingNodeIds.has(w.xyNodeId),
      ),
    [openedWindows, existingNodeIds],
  );

  if (minimized.length === 0) return null;

  const visible = minimized.slice(0, MAX_VISIBLE_PILLS);
  const overflow = minimized.slice(MAX_VISIBLE_PILLS);

  return (
    <div className="flex flex-row-reverse items-center gap-2">
      {visible.map((openedWindow) => (
        <MinimizedPill key={openedWindow.xyNodeId} window={openedWindow} />
      ))}

      {overflow.length > 0 ? (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger asChild>
            {/* `key` : le bouton rejoue son apparition à chaque window qui
                le rejoint, seul signe qu'elle est partie là. */}
            <button
              key={overflow.length}
              type="button"
              aria-label={`${overflow.length} more minimized windows`}
              className="canvas-ui-container animate-node-appear h-[42px] shrink-0 px-3! text-xs font-medium text-muted-foreground! hover:text-foreground!"
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-auto p-2">
            <div className="flex flex-col items-end gap-2">
              {overflow.map((openedWindow) => (
                <MinimizedPill
                  key={openedWindow.xyNodeId}
                  window={openedWindow}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  closeAllMinimizedWindows();
                  setOverflowOpen(false);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                Close all minimized ({minimized.length})
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
