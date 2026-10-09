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
  ViewportPortal,
  type ReactFlowState,
} from "@xyflow/react";
import { LuHeading1, LuHeading2, LuHeading3 } from "react-icons/lu";
import { TbFrame, TbMaximize, TbPencil } from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { zoomCompensationScaleSelector } from "@/lib/zoomCompensation";
import NodeHandles from "../NodeHandles";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarLabel } from "../toolbar/NodeToolbarLabel";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import { useIsFrameHovered } from "@/stores/frameHoverStore";
import { useIsNodeAttached } from "@/stores/noleStore";
import { useIsNodeBookmarked } from "@/stores/bookmarkedNodesStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { useNodeDisplayOptions } from "@/hooks/useNodeDisplayOptions";
import { isCompactFrame } from "@/lib/frameVariant";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import BookmarkedBadge from "@/components/nodes/BookmarkedBadge";
import NodeCollaboratorsPill from "@/components/canvas/presence/NodeCollaboratorsPill";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { colors, resolveColor } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FRAME_TITLE_LEVEL,
  FRAME_CONTENT_PADDING,
  FRAME_TITLE_LEVELS,
  type FrameTitleLevel,
} from "@/../convex/config/nodeConfig";
import type { XyNodeProps } from "@/types/domain";
import { TITLE_HEADING_CLASSNAMES } from "./titleLevelStyles";

/** Plancher d'une frame vide : en dessous, la barre de titre ne tient plus. */
const EMPTY_MIN_WIDTH = 160;
const EMPTY_MIN_HEIGHT = 120;

/**
 * Les trois tailles du titre, avec les classes du node `title` : le canvas n'a
 * qu'une échelle typographique, et le titre d'une frame en est un niveau comme
 * un autre.
 */
const TITLE_LEVEL_CLASSNAMES: Record<FrameTitleLevel, string> =
  TITLE_HEADING_CLASSNAMES;

const TITLE_LEVEL_ICONS: Record<FrameTitleLevel, ReactNode> = {
  h1: <LuHeading1 />,
  h2: <LuHeading2 />,
  h3: <LuHeading3 />,
};

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
 *
 * Deux variantes. La dépliée est la frame ci-dessus. La compacte est une carte
 * de taille fixe, titre et résumé du contenu, qui masque ses enfants (cf.
 * `src/lib/frameVariant.ts`) : le double-clic l'ouvre en window plutôt que de
 * la déplier — la déplier reste un choix de variante.
 */
function FrameNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { getNodes } = useReactFlow();
  // Le titre garde sa taille à l'écran quand on dézoome, sauf si l'option
  // d'affichage `scaleWithZoom` est décochée : il suit alors le zoom comme le
  // reste de la frame. Les poignées de resize juste à côté suivent toujours
  // la règle (cf. `zoomCompensation`).
  const { scaleWithZoom } = useNodeDisplayOptions(xyNode);
  const zoomCompensationScale = useStore(zoomCompensationScaleSelector);
  const titleScale = scaleWithZoom ? zoomCompensationScale : 1;

  const isCompact = isCompactFrame({
    type: "frame",
    variant: xyNode.data?.variant as string | undefined,
  });
  const openWindow = useWindowsStore((state) => state.openWindow);

  const title = typeof values?.title === "string" ? values.title : "";
  const nodeColor =
    colors[resolveColor(xyNode.data?.color as string | undefined, true)];

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
  const isBookmarked = useIsNodeBookmarked(xyNode.id);

  // Sélecteur booléen : seule la frame concernée re-rend, pas toutes celles du
  // canvas. Et surtout pas un initialiseur `useState`, que StrictMode invoque
  // deux fois et qui perdrait le signal au second passage. Même patron que
  // `TitleNode`.
  const shouldAutoEdit = useNodeEditorStore(
    (state) => state.editingNodeId === xyNode.id,
  );

  // Le crayon de la toolbar : seule porte vers le renommage d'une frame
  // compacte, dont le double-clic ouvre la window, et d'une frame sans titre,
  // qui n'affiche rien à cliquer. Le compteur sert de `key` :
  // `InlineEditableText` n'ouvre l'édition qu'une fois par montage, chaque
  // demande le remonte donc. `isRenaming` retombe à la fin de l'édition, pour
  // qu'un remontage ultérieur (changement de variante) ne la rouvre pas — et
  // pour que le titre d'une frame laissée sans nom disparaisse.
  const [renameRequest, setRenameRequest] = useState(0);
  const [isRenaming, setIsRenaming] = useState(false);
  const requestRename = useCallback(() => {
    setRenameRequest((count) => count + 1);
    setIsRenaming(true);
  }, []);
  const endRename = useCallback(() => setIsRenaming(false), []);

  useEffect(() => {
    if (!shouldAutoEdit) return;
    // Consommé aussitôt : le signal ne vaut que pour ce montage, sinon revenir
    // sur le canvas rouvrirait l'édition. Passe par le renommage : le champ
    // doit s'afficher même si la frame n'a pas encore de titre.
    useNodeEditorStore.getState().setEditingNodeId(null);
    requestRename();
  }, [shouldAutoEdit, requestRename]);

  // Une frame peut rester sans titre : rien n'est alors affiché au-dessus
  // d'elle, sauf pendant qu'on la nomme.
  const showTitle = title !== "" || isRenaming;

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "frame" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const handleCompactDoubleClick = useCallback(() => {
    // Un double-clic dans le champ du titre sélectionne un mot, il n'ouvre
    // rien.
    if (isRenaming) return;
    handleOpenWindow();
  }, [isRenaming, handleOpenWindow]);

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
    // Compacte : pas de poignées, donc pas de bornes à mesurer.
    if (isSelected && !isCompact) measureContent();
  }, [isSelected, isCompact, measureContent]);

  const renameButton = (
    <NodeToolbarButton label="Rename" onClick={requestRename}>
      <TbPencil />
    </NodeToolbarButton>
  );

  if (isCompact) {
    return (
      <>
        {/* Au-dessus, comme les autres nodes : la carte porte son titre en
            elle, le bord haut est libre. */}
        <CanvasNodeToolbar xyNode={xyNode} position={Position.Top}>
          <NodeToolbarButton
            label="Open"
            title="Open in a window"
            disabled={!nodeDataId}
            onClick={handleOpenWindow}
          >
            <TbMaximize />
          </NodeToolbarButton>
          {renameButton}
        </CanvasNodeToolbar>

        <NodeHandles showSourceHandles={xyNode.selected} nodeId={xyNode.id} />

        <div
          className={cn(
            "relative flex h-full w-full items-center gap-2.5 rounded-xl border-2 px-3",
            "shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
            "transition-[background-color,border-color,box-shadow] duration-100",
            nodeColor.frameBorder,
            nodeColor.frameBg,
            // Transparente, la carte ne serait plus qu'un texte flottant : un
            // pointillé garde sa forme de conteneur.
            nodeColor === colors.transparent &&
              "border-dashed border-slate-300 bg-white/70",
            xyNode.selected
              ? "ring-2 ring-blue-500/70"
              : "hover:ring-1 hover:ring-blue-400/60",
            isAttachedToNole &&
              "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[16px] after:border-2 after:border-dashed after:border-violet-500/90",
          )}
          onDoubleClick={handleCompactDoubleClick}
        >
          {isBookmarked && <BookmarkedBadge />}
          <TbFrame size={18} className={cn("shrink-0", nodeColor.textColor)} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* Désactivé hors renommage : son double-clic ne s'arrête plus
                là, il remonte à la carte et ouvre la window. */}
            <InlineEditableText
              key={renameRequest}
              value={title}
              onSave={rename}
              onEditEnd={endRename}
              disabled={!isRenaming}
              startInEditMode={isRenaming}
              singleLine
              placeholder="Untitled frame"
              // Même typo que les titres des autres nodes (cf. `NodeHeader`) :
              // corps de texte en `font-medium`, couleur du texte de la carte.
              className="font-medium"
              inputClassName="font-medium"
            />
            <CompactFrameSummary frameId={xyNode.id} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Au-dessus, comme les autres nodes. */}
      <CanvasNodeToolbar xyNode={xyNode} position={Position.Top}>
        {renameButton}
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
          frame.

          Rendu hors du node, dans le calque du viewport au-dessus de tous les
          nodes (cf. `FrameTitleLayer`) : posé dans la frame, il héritait de
          son plan, et tout node qui débordait sur la bande au-dessus d'elle
          le recouvrait. */}
      {showTitle && (
        <FrameTitleLayer nodeId={xyNode.id}>
          <div
            className="pointer-events-auto absolute bottom-full left-0 mb-1 flex max-w-full items-center gap-1"
            style={{
              scale: String(titleScale),
              transformOrigin: "bottom left",
            }}
            title={title || undefined}
          >
            {/* `nodrag nopan` : le titre ne déplace ni la frame ni le canvas,
              comme quand il vivait dans le node (où `nodrag` empêchait que le
              pointerdown qui ouvre l'édition démarre un drag). */}
            <InlineEditableText
              key={renameRequest}
              value={title}
              onSave={rename}
              onEditEnd={endRename}
              startInEditMode={isRenaming}
              singleLine
              placeholder="Untitled frame"
              className={cn(
                "nodrag nopan max-w-[40ch] truncate rounded px-1 leading-tight",
                TITLE_LEVEL_CLASSNAMES[level],
                nodeColor.textColor,
              )}
              inputClassName={TITLE_LEVEL_CLASSNAMES[level]}
            />
          </div>
        </FrameTitleLayer>
      )}

      <div
        className={cn(
          // `transition-colors` ne couvrait pas le ring de survol, qui est une
          // `box-shadow` : sans elle listée, il apparaissait d'un coup.
          "relative h-full w-full rounded-[5px] border-2",
          "transition-[background-color,border-color,box-shadow] duration-100",
          nodeColor.frameBorder,
          // `lightBg` et non `nodeBg` : c'est la teinte la plus claire de la
          // palette, celle qui tient sur une grande surface. Une frame en
          // `nodeBg` écraserait les nodes blancs posés dessus. Le cas
          // `transparent` tombe juste tout seul — fond ET bordure y sont
          // transparents, la frame se réduit à son titre.
          nodeColor.frameBg,
          xyNode.selected && "ring-2 ring-blue-500/70",
          // Survol : même signal que les nodes (cf. `NodeFrame`), en plus
          // discret parce qu'une frame est une grande surface. Il dit que le
          // corps est saisissable — toute la frame se déplace et se
          // sélectionne, pas seulement sa barre de titre. Effacé dès qu'un
          // état du geste ou du document prend le dessus, pour ne pas cumuler
          // deux rings.
          !xyNode.selected &&
            !isDropTarget &&
            "hover:ring-1 hover:ring-blue-400/50",
          // Cible de dépôt : la bordure prime sur la couleur du node, c'est
          // une réponse au geste en cours et pas un état du document.
          isDropTarget && "border-blue-500 bg-blue-500/10",
          // Même halo que `NodeFrame` : attach à Nolë (alt-clic).
          isAttachedToNole &&
            "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[8px] after:border-2 after:border-dashed after:border-violet-500/90",
        )}
      >
        {/* Même pastille que `NodeFrame` (cf. `BookmarkedBadge`). */}
        {isBookmarked && <BookmarkedBadge />}
        {/* Même pill que `NodeFrame` : qui d'autre est sur la frame. */}
        <NodeCollaboratorsPill nodeId={xyNode.id} />
      </div>
    </>
  );
}

/** Au-delà, les types restants se résument au total. */
const MAX_SUMMARY_TYPES = 4;

/**
 * Le contenu d'une frame compacte en une ligne : le total, puis les types les
 * plus représentés.
 *
 * Composant à part et monté par la seule carte compacte : la souscription au
 * store tourne à chaque changement de nodes, une frame dépliée n'a pas à la
 * payer. Le sélecteur rend une chaîne, comparée par valeur — la carte ne
 * re-rend que si le décompte change, pas à chaque drag ailleurs sur le
 * canvas.
 */
function CompactFrameSummary({ frameId }: { frameId: string }) {
  const summaryKey = useStore((state: ReactFlowState) => {
    const counts = new Map<string, number>();
    for (const node of state.nodes) {
      if (node.parentId !== frameId || !node.type) continue;
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type}:${count}`)
      .join(",");
  });

  const entries = summaryKey
    ? summaryKey.split(",").map((entry) => {
        const [type, count] = entry.split(":");
        return { type, count: Number(count) };
      })
    : [];
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">
        {total === 0 ? "Empty" : `${total} ${total === 1 ? "node" : "nodes"}`}
      </span>
      {entries.slice(0, MAX_SUMMARY_TYPES).map(({ type, count }) => {
        const Icon = getNodeIcon(type);
        if (!Icon) return null;
        return (
          <span
            key={type}
            className="flex shrink-0 items-center gap-0.5"
            title={`${count} ${type}`}
          >
            <Icon className="size-3.5" />
            {count}
          </span>
        );
      })}
    </div>
  );
}

type TitleAnchor = { x: number; y: number; width: number | undefined };

function sameAnchor(a?: TitleAnchor, b?: TitleAnchor) {
  return a?.x === b?.x && a?.y === b?.y && a?.width === b?.width;
}

/**
 * Le calque des titres de frame : `ViewportPortal` rend dans
 * `.react-flow__viewport-portal`, frère des nodes, placé au-dessus d'eux
 * (cf. index.css). Le titre y reste donc lisible quel que soit le plan de sa
 * frame.
 *
 * Le portail est React : les événements du titre remontent quand même au
 * wrapper du node — clic (sélection, alt-clic vers Nolë), double-clic, menu
 * contextuel. Seul le drag natif (d3) de React Flow ne le voit pas.
 *
 * Abonné seul à la position absolue de la frame (et à sa largeur, qui borne
 * celle du titre) : `areNodePropsEqual` ignore
 * la position, et c'est voulu — la frame ne re-rend pas à chaque pixel d'un
 * drag, seul ce petit conteneur le fait.
 */
function FrameTitleLayer({
  nodeId,
  children,
}: {
  nodeId: string;
  children: ReactNode;
}) {
  const anchor = useStore((state: ReactFlowState): TitleAnchor | undefined => {
    const node = state.nodeLookup.get(nodeId);
    if (!node) return undefined;
    const { x, y } = node.internals.positionAbsolute;
    return { x, y, width: node.measured.width ?? node.width };
  }, sameAnchor);
  if (!anchor) return null;

  return (
    <ViewportPortal>
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${anchor.x}px, ${anchor.y}px)`,
          width: anchor.width,
        }}
      >
        {children}
      </div>
    </ViewportPortal>
  );
}

export default memo(FrameNode, areNodePropsEqual);
