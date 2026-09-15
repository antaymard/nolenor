import { memo, useCallback, useEffect, useState } from "react";
import { NodeResizer, useReactFlow } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { colors } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import type { XyNodeProps, colorsEnum } from "@/types/domain";

/**
 * La marge laissée entre le contenu d'une frame et son bord quand on calcule
 * la taille minimale au redimensionnement. Assez pour que le dernier node ne
 * touche pas la bordure, pas assez pour qu'on la sente comme un blocage
 * prématuré.
 */
const CONTENT_PADDING = 24;

/** Plancher d'une frame vide : en dessous, la barre de titre ne tient plus. */
const EMPTY_MIN_WIDTH = 160;
const EMPTY_MIN_HEIGHT = 120;

/**
 * Un conteneur : il groupe des nodes, qui le déclarent en `parentId` et
 * portent dès lors une position relative à lui. C'est le seul node du canvas
 * dont le contenu est fait d'autres nodes.
 *
 * Ne passe volontairement pas par `NodeFrame`, qui câble le double-clic sur
 * `openWindow` et pose des `NodeHandles`. Une frame n'ouvre pas de fenêtre et
 * ne se connecte à rien : son corps doit rester une surface inerte.
 *
 * La règle « on ne la sélectionne et on ne la déplace que depuis son titre »
 * tient à deux choses qui doivent rester ensemble : le `pointer-events: none`
 * posé sur `.react-flow__node-frame` dans `index.css` (le corps laisse passer
 * les clics), et le `dragHandle` posé par `fromCanvasNodeToXyNode` (React Flow
 * ne démarre un drag que depuis la barre de titre). Retirer l'un des deux
 * laisse la frame attrapable par son fond.
 */
function FrameNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { getNodes } = useReactFlow();

  const title = typeof values?.title === "string" ? values.title : "";
  const nodeColor = colors[(xyNode.data?.color as colorsEnum) || "default"];

  // Sélecteur booléen : seule la frame concernée re-rend, pas toutes celles du
  // canvas. Et surtout pas un initialiseur `useState`, que StrictMode invoque
  // deux fois et qui perdrait le signal au second passage. Même patron que
  // `ViewportNode` et `TitleNode`.
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

  /**
   * On ne rétrécit pas une frame sous son contenu.
   *
   * Mesuré à la demande et pas via un abonnement au store : s'abonner aux
   * positions des enfants ferait re-rendre chaque frame du canvas à chaque
   * frame du drag d'un node, pour une valeur qui ne sert qu'au
   * redimensionnement.
   *
   * Mesuré à la sélection ET au `onResizeStart` : à la sélection parce que
   * c'est le moment où les poignées apparaissent, donc le dernier instant
   * tranquille avant un resize ; au démarrage du resize parce que le contenu a
   * pu bouger entre-temps. Le premier des deux suffit à ce que les bornes
   * soient bonnes dès le premier pixel — `ResizeControl` ne relit ses
   * `boundaries` que dans un effet.
   *
   * Les positions des enfants sont déjà relatives à la frame : le coin bas
   * droit du contenu se lit directement, sans conversion.
   */
  const [minSize, setMinSize] = useState({
    width: EMPTY_MIN_WIDTH,
    height: EMPTY_MIN_HEIGHT,
  });
  const measureContent = useCallback(() => {
    const children = getNodes().filter((node) => node.parentId === xyNode.id);
    if (children.length === 0) {
      setMinSize({ width: EMPTY_MIN_WIDTH, height: EMPTY_MIN_HEIGHT });
      return;
    }
    const right = Math.max(
      ...children.map(
        (child) => child.position.x + (child.measured?.width ?? child.width ?? 0),
      ),
    );
    const bottom = Math.max(
      ...children.map(
        (child) =>
          child.position.y + (child.measured?.height ?? child.height ?? 0),
      ),
    );
    setMinSize({
      width: Math.max(EMPTY_MIN_WIDTH, right + CONTENT_PADDING),
      height: Math.max(EMPTY_MIN_HEIGHT, bottom + CONTENT_PADDING),
    });
  }, [getNodes, xyNode.id]);

  const isSelected = xyNode.selected;
  useEffect(() => {
    if (isSelected) measureContent();
  }, [isSelected, measureContent]);

  return (
    <>
      <NodeResizer
        isVisible={xyNode.selected}
        minWidth={minSize.width}
        minHeight={minSize.height}
        onResizeStart={measureContent}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ height: 8, width: 8, borderRadius: 2, zIndex: 10 }}
      />

      {/* Au-dessus du bord haut et non dedans, comme dans Figma : la barre ne
          mange pas la surface utile, et le contenu de la frame ne passe jamais
          sous elle. `frame-interactive` est ce qui lui rend les pointer-events
          que le wrapper coupe ; `frame-drag-handle` est ce que React Flow
          cherche pour démarrer un drag. */}
      <div
        className="frame-interactive frame-drag-handle absolute bottom-full left-0 mb-1 flex max-w-full cursor-grab items-center gap-1 active:cursor-grabbing"
        title={title || undefined}
      >
        <InlineEditableText
          value={title}
          onSave={rename}
          startInEditMode={startInEditMode}
          singleLine
          placeholder="Untitled frame"
          className={cn(
            "max-w-[40ch] truncate rounded px-1 text-xs font-medium",
            xyNode.selected ? "text-blue-600" : "text-muted-foreground",
          )}
          inputClassName="text-xs font-medium"
        />
      </div>

      <div
        className={cn(
          "h-full w-full rounded-[5px] border-2",
          nodeColor.nodeBorder,
          // Fond très léger : une frame se place derrière les nodes (cf. la
          // bande basse de zIndex dans `nodeLayering`), elle doit se lire sans
          // assombrir ce qu'elle contient.
          xyNode.data?.color === "transparent"
            ? "bg-transparent"
            : "bg-slate-500/5",
          xyNode.selected && "ring-2 ring-blue-500/70",
        )}
      />
    </>
  );
}

export default memo(FrameNode, areNodePropsEqual);
