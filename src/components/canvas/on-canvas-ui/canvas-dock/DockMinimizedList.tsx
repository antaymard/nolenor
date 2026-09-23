import { TbLocation, TbX } from "react-icons/tb";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useWindowsStore, type OpenedWindow } from "@/stores/windowsStore";
import DockSection from "./DockSection";
import { rowEnterProps } from "./dockRowEnter";
import DockRow from "./DockRow";

/**
 * Une window minimisée, dans la liste du dock.
 *
 * Le titre et l'icône viennent du nodeData et pas de la window : une window
 * reste ouverte pendant qu'on édite son node, et son libellé doit suivre.
 */
function MinimizedRow({ window: openedWindow }: { window: OpenedWindow }) {
  const toggleMinimizeWindow = useWindowsStore((s) => s.toggleMinimizeWindow);
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const goToNode = useGoToNode();

  const title = useNodeDataTitle(openedWindow.nodeDataId);
  const nodeData = useNodeData(openedWindow.nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  return (
    <DockRow
      icon={NodeIcon ?? null}
      label={title ?? "—"}
      onClick={() => toggleMinimizeWindow(openedWindow.xyNodeId)}
      // Clic milieu : ferme la window sans la restaurer. Raccourci hérité de
      // l'ancienne pastille, et le réflexe des onglets de navigateur.
      onMouseDown={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        closeWindow(openedWindow.xyNodeId);
      }}
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
  );
}

/**
 * La section des windows minimisées, dans le panneau du dock.
 *
 * Pas de poignée de drag ici, contrairement aux repères : leur ordre n'est
 * stocké nulle part et repartirait à l'ordre de minimisation au rechargement.
 * Une poignée mentirait sur ce que fait l'UI.
 *
 * Le filtrage des windows dont le node a disparu est fait par l'appelant
 * (`CanvasDock`), qui a besoin du même compte pour sa pastille — le calculer
 * deux fois les ferait diverger d'une frame.
 */
export default function DockMinimizedList({
  windows,
}: {
  windows: Array<OpenedWindow>;
}) {
  const closeAllMinimizedWindows = useWindowsStore(
    (s) => s.closeAllMinimizedWindows,
  );

  return (
    <DockSection
      title="Minimized"
      count={windows.length > 0 ? windows.length : undefined}
      isEmpty={windows.length === 0}
      emptyLabel="No minimized windows."
      headerAction={
        windows.length > 0 ? (
          // Dans l'en-tête de la section et pas en pied de panneau : maintenant
          // que les repères suivent dans le même panneau, un « Close all » en
          // bas se lirait comme une action sur eux.
          <button
            type="button"
            onClick={closeAllMinimizedWindows}
            className="rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            Close all
          </button>
        ) : undefined
      }
    >
      {windows.map((openedWindow, index) => (
        <div key={openedWindow.xyNodeId} {...rowEnterProps(index)}>
          <MinimizedRow window={openedWindow} />
        </div>
      ))}
    </DockSection>
  );
}
