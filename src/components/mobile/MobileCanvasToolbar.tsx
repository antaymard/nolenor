import { useCallback, useState, type RefObject } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { TbCopy, TbPlus, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import AddBlockMenuContent from "@/components/canvas/context-menus/AddBlockMenuContent";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";

/**
 * La barre d'outils du canvas mobile.
 *
 * Les actions de sélection ne sont pas du confort : le long-press ne déclenche
 * pas `contextmenu` sur iOS et `deleteKeyCode` est désactivé, donc c'est le seul
 * chemin pour supprimer ou dupliquer un node au doigt.
 */
export default function MobileCanvasToolbar({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const { screenToFlowPosition, getNodes, deleteElements } = useReactFlow();
  const { duplicateNode } = useDuplicateNode();

  // On ne souscrit qu'à l'ensemble des ids sélectionnés : pan, zoom et drag ne
  // doivent pas re-rendre la barre.
  const selectedIdsKey = useStore((state) =>
    state.nodes
      .filter((node) => node.selected)
      .map((node) => node.id)
      .join(","),
  );
  const selectedIds = selectedIdsKey ? selectedIdsKey.split(",") : [];

  // `screenToFlowPosition` part de coordonnées écran : on vise le centre du
  // conteneur du flow, pas celui de la fenêtre — la top bar et la nav le
  // décalent.
  const getCreatePosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
    }
    return screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [containerRef, screenToFlowPosition]);

  const handleDuplicate = () => {
    const node = getNodes().find((n) => n.id === selectedIds[0]);
    if (node) void duplicateNode(node);
  };

  const handleDelete = () => {
    void deleteElements({ nodes: selectedIds.map((id) => ({ id })) });
  };

  return (
    <div className="canvas-ui-container px-0!">
      <DropdownMenu open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ajouter un bloc">
            <TbPlus size={20} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" sideOffset={10}>
          <AddBlockMenuContent
            getCreatePosition={getCreatePosition}
            onCreated={() => setIsAddMenuOpen(false)}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedIds.length === 1 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDuplicate}
          aria-label="Dupliquer"
        >
          <TbCopy size={20} />
        </Button>
      )}

      {selectedIds.length > 0 && (
        <ConfirmableButton
          title={
            selectedIds.length === 1
              ? "Delete this node?"
              : `Delete ${selectedIds.length} nodes?`
          }
          text="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
        >
          <Button
            variant="ghost"
            size="icon"
            className="text-red-500"
            aria-label="Supprimer"
          >
            <TbTrash size={20} />
          </Button>
        </ConfirmableButton>
      )}
    </div>
  );
}
