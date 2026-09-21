import {
  memo,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { LuHeading1, LuHeading2, LuHeading3 } from "react-icons/lu";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeHandles from "../NodeHandles";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarLabel } from "../toolbar/NodeToolbarLabel";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import { useIsFrameHovered } from "@/stores/frameHoverStore";
import { useIsNodeAttached } from "@/stores/noleStore";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { colors } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FRAME_TITLE_LEVEL,
  FRAME_CONTENT_PADDING,
  FRAME_TITLE_LEVELS,
  type FrameTitleLevel,
} from "@/../convex/config/nodeConfig";
import type { XyNodeProps, colorsEnum } from "@/types/domain";

/** Plancher d'une frame vide : en dessous, la barre de titre ne tient plus. */
const EMPTY_MIN_WIDTH = 160;
const EMPTY_MIN_HEIGHT = 120;

/**
 * Les trois tailles du titre, avec les classes du node `title` : le canvas n'a
 * qu'une échelle typographique, et le titre d'une frame en est un niveau comme
 * un autre.
 */
const TITLE_LEVEL_CLASSNAMES: Record<FrameTitleLevel, string> = {
  h1: "text-2xl font-semibold",
  h2: "text-lg font-semibold",
  h3: "text-md font-semibold",
};

const TITLE_LEVEL_ICONS: Record<FrameTitleLevel, ReactNode> = {
  h1: <LuHeading1 />,
  h2: <LuHeading2 />,
  h3: <LuHeading3 />,
};

/**
 * Le titre garde sa taille à l'écran quand on dézoome.
 *
 * `Math.max(1 / zoom, 1)` — copié de `scaleSelector` dans React Flow, qui
 * l'applique à ses poignées de resize : le titre grossit à mesure qu'on
 * s'éloigne, donc reste lisible, mais ne rétrécit jamais sous sa taille CSS
 * quand on zoome dedans. Les poignées de resize juste à côté suivent
 * exactement la même règle, l'ensemble reste cohérent.
 */
const titleScaleSelector = (state: { transform: [number, number, number] }) =>
  Math.max(1 / state.transform[2], 1);

const RESIZE_LINE_STYLE: CSSProperties = { borderWidth: 2 };
const RESIZE_HANDLE_STYLE: CSSProperties = {
  height: 8,
  width: 8,
  borderRadius: 2,
  zIndex: 10,
};

/**
 * Les huit contrôles de redimensionnement, posés un par un.
 *
 * `NodeResizer` les pose lui-même, mais avec un seul `minWidth` et un seul
 * `minHeight` pour tous. Une frame en a besoin de deux par axe (cf.
 * `measureContent`), d'où ce rendu explicite — positions, variantes et styles
 * sont exactement ceux que `NodeResizer` leur donnait.
 *
 * Le bord concerné se lit sur le nom de la position, comme dans
 * `getControlDirection` chez React Flow : un contrôle « left » déplace le bord
 * gauche, un contrôle « top » le bord haut.
 */
const RESIZE_CONTROLS = [
  { position: "top", variant: ResizeControlVariant.Line },
  { position: "right", variant: ResizeControlVariant.Line },
  { position: "bottom", variant: ResizeControlVariant.Line },
  { position: "left", variant: ResizeControlVariant.Line },
  { position: "top-left", variant: ResizeControlVariant.Handle },
  { position: "top-right", variant: ResizeControlVariant.Handle },
  { position: "bottom-left", variant: ResizeControlVariant.Handle },
  { position: "bottom-right", variant: ResizeControlVariant.Handle },
] as const;

/**
 * Les bornes de rétrécissement d'une frame : une par bord, parce qu'un bord
 * droit et un bord gauche ne butent pas sur la même chose.
 *
 * Tirer le bord DROIT (ou BAS) laisse le coin haut gauche en place : le contenu
 * garde ses coordonnées, et la frame ne peut pas remonter au-dessus du bord
 * droit (ou bas) de ce contenu. Tirer le bord GAUCHE (ou HAUT) déplace ce coin,
 * et les enfants compensent pour ne pas bouger en coordonnées monde : ce qui
 * borne alors, c'est le bord GAUCHE (ou HAUT) du contenu, que le bord de la
 * frame ne doit pas franchir.
 */
type MinSize = {
  widthFromRight: number;
  widthFromLeft: number;
  heightFromBottom: number;
  heightFromTop: number;
};

/**
 * Une borne ne doit jamais dépasser la taille actuelle.
 *
 * `getSizeClamp`, chez React Flow, retire l'excédent de la dimension en cours :
 * une borne plus grande que la frame la ferait rétrécir sur un axe qu'on ne
 * touche même pas — tirer le bord haut lui volerait de la largeur. Quand le
 * contenu déborde déjà, la frame ne rétrécit donc plus, elle ne fait que
 * grandir.
 *
 * `current` à 0 = node pas encore mesuré : la borne passe telle quelle, sinon
 * plus aucun redimensionnement ne serait possible.
 */
function boundedBy(min: number, current: number) {
  return current > 0 ? Math.min(min, current) : min;
}

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

  // Les frames tracées avant l'arrivée des niveaux n'ont pas de `level` :
  // elles prennent le même défaut que zod applique aux nouvelles.
  const level = (FRAME_TITLE_LEVELS as readonly string[]).includes(
    values?.level as string,
  )
    ? (values?.level as FrameTitleLevel)
    : DEFAULT_FRAME_TITLE_LEVEL;

  // Un node dragué survole cette frame : elle s'entoure pour dire « au
  // relâcher, il est ici ». Abonnement au seul booléen qui la concerne, donc
  // deux frames re-rendent quand le survol passe de l'une à l'autre, pas tout
  // le canvas à chaque frame du geste.
  const isDropTarget = useIsFrameHovered(xyNode.id);
  const isAttachedToNole = useIsNodeAttached(xyNode.id);

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

  const setLevel = useCallback(
    (nextLevel: string) => {
      // Un ToggleGroup `single` renvoie "" quand on re-clique l'option active :
      // une frame a toujours un niveau, on ignore la désélection.
      if (!nextLevel || !nodeDataId) return;
      void updateNodeDataValues({ nodeDataId, values: { level: nextLevel } });
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
   * Les positions des enfants sont déjà relatives à la frame : les bords du
   * contenu se lisent directement, sans conversion.
   */
  const [minSize, setMinSize] = useState<MinSize>({
    widthFromRight: EMPTY_MIN_WIDTH,
    widthFromLeft: EMPTY_MIN_WIDTH,
    heightFromBottom: EMPTY_MIN_HEIGHT,
    heightFromTop: EMPTY_MIN_HEIGHT,
  });
  const measureContent = useCallback(() => {
    const nodes = getNodes();
    const self = nodes.find((node) => node.id === xyNode.id);
    const width = self?.measured?.width ?? self?.width ?? 0;
    const height = self?.measured?.height ?? self?.height ?? 0;
    const children = nodes.filter((node) => node.parentId === xyNode.id);
    if (children.length === 0) {
      setMinSize({
        widthFromRight: boundedBy(EMPTY_MIN_WIDTH, width),
        widthFromLeft: boundedBy(EMPTY_MIN_WIDTH, width),
        heightFromBottom: boundedBy(EMPTY_MIN_HEIGHT, height),
        heightFromTop: boundedBy(EMPTY_MIN_HEIGHT, height),
      });
      return;
    }
    const left = Math.min(...children.map((child) => child.position.x));
    const top = Math.min(...children.map((child) => child.position.y));
    const right = Math.max(
      ...children.map(
        (child) =>
          child.position.x + (child.measured?.width ?? child.width ?? 0),
      ),
    );
    const bottom = Math.max(
      ...children.map(
        (child) =>
          child.position.y + (child.measured?.height ?? child.height ?? 0),
      ),
    );
    setMinSize({
      widthFromRight: boundedBy(
        Math.max(EMPTY_MIN_WIDTH, right + FRAME_CONTENT_PADDING),
        width,
      ),
      // Le bord droit ne bouge pas : ce qui reste entre lui et le bord gauche
      // du contenu, c'est `width - left`.
      widthFromLeft: boundedBy(
        Math.max(EMPTY_MIN_WIDTH, width - left + FRAME_CONTENT_PADDING),
        width,
      ),
      heightFromBottom: boundedBy(
        Math.max(EMPTY_MIN_HEIGHT, bottom + FRAME_CONTENT_PADDING),
        height,
      ),
      heightFromTop: boundedBy(
        Math.max(EMPTY_MIN_HEIGHT, height - top + FRAME_CONTENT_PADDING),
        height,
      ),
    });
  }, [getNodes, xyNode.id]);

  const isSelected = xyNode.selected;
  useEffect(() => {
    if (isSelected) measureContent();
  }, [isSelected, measureContent]);

  return (
    <>
      {/* Sous la frame et non au-dessus, à l'inverse des autres nodes : son
          bord haut porte déjà le titre. */}
      <CanvasNodeToolbar xyNode={xyNode} position={Position.Bottom}>
        <NodeToolbarLabel>Title size</NodeToolbarLabel>
        <ToggleGroup
          type="single"
          variant="default"
          value={level}
          onValueChange={setLevel}
        >
          {FRAME_TITLE_LEVELS.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={`Title size ${value}`}
              title={`Title size ${value}`}
              className="h-8 min-w-8 [&_svg:not([class*='size-'])]:size-[18px]"
            >
              {TITLE_LEVEL_ICONS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CanvasNodeToolbar>

      <NodeHandles showSourceHandles={xyNode.selected} nodeId={xyNode.id} />

      {xyNode.selected
        ? RESIZE_CONTROLS.map(({ position, variant }) => (
            <NodeResizeControl
              key={position}
              position={position}
              variant={variant}
              style={
                variant === ResizeControlVariant.Line
                  ? RESIZE_LINE_STYLE
                  : RESIZE_HANDLE_STYLE
              }
              minWidth={
                position.includes("left")
                  ? minSize.widthFromLeft
                  : minSize.widthFromRight
              }
              minHeight={
                position.includes("top")
                  ? minSize.heightFromTop
                  : minSize.heightFromBottom
              }
              onResizeStart={measureContent}
            />
          ))
        : null}

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
            "nodrag max-w-[40ch] truncate rounded px-1 leading-tight",
            TITLE_LEVEL_CLASSNAMES[level],
            nodeColor.textColor,
          )}
          inputClassName={TITLE_LEVEL_CLASSNAMES[level]}
        />
      </div>

      <div
        className={cn(
          "relative h-full w-full rounded-[5px] border-2 transition-colors duration-100",
          nodeColor.frameBorder,
          // `lightBg` et non `nodeBg` : c'est la teinte la plus claire de la
          // palette, celle qui tient sur une grande surface. Une frame en
          // `nodeBg` écraserait les nodes blancs posés dessus. Le cas
          // `transparent` tombe juste tout seul — fond ET bordure y sont
          // transparents, la frame se réduit à son titre.
          nodeColor.frameBg,
          xyNode.selected && "ring-2 ring-blue-500/70",
          // Cible de dépôt : la bordure prime sur la couleur du node, c'est
          // une réponse au geste en cours et pas un état du document.
          isDropTarget && "border-blue-500 bg-blue-500/10",
          // Même halo que `NodeFrame` : attach à Nolë (alt-clic).
          isAttachedToNole &&
            "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[8px] after:border-2 after:border-dashed after:border-violet-500/90",
        )}
      />
    </>
  );
}

export default memo(FrameNode, areNodePropsEqual);
