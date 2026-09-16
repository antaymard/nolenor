import { memo, useCallback, useEffect, useState } from "react";
import { NodeResizer, useReactFlow, useStore } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeHandles from "../NodeHandles";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import { useIsFrameHovered } from "@/stores/frameHoverStore";
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
 * Le titre garde sa taille à l'écran quand on dézoome.
 *
 * `Math.max(1 / zoom, 1)` — copié de `scaleSelector` dans React Flow, qui
 * l'applique à ses poignées de resize : le titre grossit à mesure qu'on
 * s'éloigne, donc reste lisible, mais ne rétrécit jamais sous sa taille CSS
 * quand on zoome dedans. Les poignées du `NodeResizer` juste à côté suivent
 * exactement la même règle, l'ensemble reste cohérent.
 */
const titleScaleSelector = (state: { transform: [number, number, number] }) =>
  Math.max(1 / state.transform[2], 1);

/**
 * Un conteneur : il groupe des nodes, qui le déclarent en `parentId` et
 * portent dès lors une position relative à lui. C'est le seul node du canvas
 * dont le contenu est fait d'autres nodes.
 *
 * Ne passe volontairement pas par `NodeFrame`, qui câble le double-clic sur
 * `openWindow` : une frame n'ouvre pas de fenêtre. Elle pose en revanche les
 * mêmes `NodeHandles` que tout le monde — purement visuels, il n'y a aucun
 * système de dépendances derrière les edges.
 *
 * Se déplace et se sélectionne depuis TOUT son corps, comme n'importe quel
 * node. Conséquence assumée : un drag qui part de l'intérieur d'une frame la
 * déplace au lieu de lasso-sélectionner son contenu — pour ça, partir du
 * dehors. C'est le comportement de Figma, le fond d'une frame lui appartient.
 */
function FrameNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { getNodes } = useReactFlow();
  const titleScale = useStore(titleScaleSelector);

  const title = typeof values?.title === "string" ? values.title : "";
  const nodeColor = colors[(xyNode.data?.color as colorsEnum) || "default"];

  // Un node dragué survole cette frame : elle s'entoure pour dire « au
  // relâcher, il est ici ». Abonnement au seul booléen qui la concerne, donc
  // deux frames re-rendent quand le survol passe de l'une à l'autre, pas tout
  // le canvas à chaque frame du geste.
  const isDropTarget = useIsFrameHovered(xyNode.id);

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
      <NodeHandles showSourceHandles={xyNode.selected} nodeId={xyNode.id} />
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
          sous elle. D'où l'origine de transformation en bas à gauche — le titre
          grandit vers le haut et la droite, en restant collé au coin de la
          frame. */}
      <div
        className="absolute bottom-full left-0 mb-1 flex max-w-full cursor-grab items-center gap-1 active:cursor-grabbing"
        style={{ scale: String(titleScale), transformOrigin: "bottom left" }}
        title={title || undefined}
      >
        {/* `nodrag` : sans ça, le pointerdown qui ouvre l'édition du titre
            démarrerait un déplacement de la frame, puisque tout le corps drague
            désormais. C'est la classe que React Flow exclut de son drag (cf.
            `noDragClassName`), la même que portent ses `<Handle>`. */}
        <InlineEditableText
          value={title}
          onSave={rename}
          startInEditMode={startInEditMode}
          singleLine
          placeholder="Untitled frame"
          className={cn(
            "nodrag max-w-[40ch] truncate rounded px-1 text-xs font-medium",
            nodeColor.textColor,
          )}
          inputClassName="text-xs font-medium"
        />
      </div>

      <div
        className={cn(
          "h-full w-full rounded-[5px] border-2 transition-colors duration-100",
          nodeColor.nodeBorder,
          // `lightBg` et non `nodeBg` : c'est la teinte la plus claire de la
          // palette, celle qui tient sur une grande surface. Une frame en
          // `nodeBg` écraserait les nodes blancs posés dessus. Le cas
          // `transparent` tombe juste tout seul — fond ET bordure y sont
          // transparents, la frame se réduit à son titre.
          nodeColor.lightBg,
          xyNode.selected && "ring-2 ring-blue-500/70",
          // Cible de dépôt : la bordure prime sur la couleur du node, c'est
          // une réponse au geste en cours et pas un état du document.
          isDropTarget && "border-blue-500 bg-blue-500/10",
        )}
      />
    </>
  );
}

export default memo(FrameNode, areNodePropsEqual);
