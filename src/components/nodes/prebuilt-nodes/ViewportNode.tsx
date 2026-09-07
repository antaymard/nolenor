import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { TbFocusCentered, TbGps, TbMaximize } from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { useFramingMatch, useGoToFraming } from "@/hooks/useViewportFraming";
import { readFraming } from "@/lib/canvasViewportFraming";
import { useWindowsStore } from "@/stores/windowsStore";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import NodeFrame from "../NodeFrame";
import type { XyNodeProps } from "@/types/domain";

/**
 * Un repère de navigation : il porte un cadrage de canvas et un bouton qui y
 * ramène la vue. Remplace les slideshows et les hotspots, qui vivaient tous
 * deux en tableaux sur le document `canvases`.
 *
 * Le titre s'édite en place, et reçoit le curseur à la création (`autoEdit`),
 * comme celui du node `title`. `InlineEditableText` arrête la propagation de
 * son double-clic : renommer depuis le titre et ouvrir la fenêtre depuis le
 * reste du node ne se marchent pas dessus.
 */
function ViewportNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const goToFraming = useGoToFraming();
  const openWindow = useWindowsStore((s) => s.openWindow);
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  // Sélecteur booléen : seuls les deux nodes concernés par un changement
  // re-rendent, pas tous les repères du canvas. Même patron que `TitleNode` —
  // et surtout pas un initialiseur `useState`, que StrictMode invoque deux fois
  // et qui perdrait le signal au second passage.
  const shouldAutoEdit = useNodeEditorStore(
    (state) => state.editingNodeId === xyNode.id,
  );
  const [startInEditMode, setStartInEditMode] = useState(false);
  useEffect(() => {
    if (!shouldAutoEdit) return;
    // Consommé aussitôt : le signal ne vaut que pour ce montage, sinon revenir
    // sur le canvas rouvrirait l'édition.
    useNodeEditorStore.getState().setEditingNodeId(null);
    setStartInEditMode(true);
  }, [shouldAutoEdit]);

  // `values.view` est stable tant que le nodeData ne change pas : le sélecteur
  // de `useFramingMatch` n'est donc pas recréé à chaque render.
  const view = values?.view;
  const framing = useMemo(() => readFraming(view), [view]);
  const match = useFramingMatch(framing);

  const title = typeof values?.title === "string" ? values.title : "";

  const rename = useCallback(
    (nextTitle: string) => {
      if (!nodeDataId) return;
      void updateNodeDataValues({
        nodeDataId,
        values: { title: nextTitle.trim() },
      });
    },
    [nodeDataId, updateNodeDataValues],
  );

  const handleGoTo = useCallback(() => {
    if (framing) goToFraming(framing);
  }, [framing, goToFraming]);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "viewport" });
  }, [nodeDataId, openWindow, xyNode.id]);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Button
          size="icon"
          variant="outline"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
          title="Ouvrir la liste des repères"
        >
          <TbMaximize />
        </Button>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode} resizable={false}>
        <div className="flex h-full min-w-0 items-center gap-2 px-2">
          <TbGps
            size={18}
            className={cn(
              "shrink-0 transition-colors",
              match === "here"
                ? "text-emerald-600"
                : match === "near"
                  ? "text-emerald-600/45"
                  : "text-muted-foreground",
            )}
            title={
              match === "here"
                ? "La vue est sur ce repère"
                : match === "near"
                  ? "La vue est proche de ce repère"
                  : undefined
            }
          />
          <InlineEditableText
            value={title}
            onSave={rename}
            as="span"
            className="min-w-0 flex-1 truncate"
            placeholder="Repère sans titre"
            startInEditMode={startInEditMode}
          />
          <Button
            size="icon"
            variant="ghost"
            // `nodrag` : sans lui le mousedown démarre un drag du node au lieu
            // d'armer le clic. `stopPropagation` sur le dblclick : deux clics
            // rapides ne doivent pas ouvrir la fenêtre par-dessus la
            // navigation (cf. le handler générique de NodeFrame).
            className="nodrag size-6 shrink-0"
            disabled={!framing}
            onClick={handleGoTo}
            onDoubleClick={(event) => event.stopPropagation()}
            title="Aller à ce repère"
            aria-label={`Aller au repère ${title || "sans titre"}`}
          >
            <TbFocusCentered />
          </Button>
        </div>
      </NodeFrame>
    </>
  );
}

export default memo(ViewportNode, areNodePropsEqual);
