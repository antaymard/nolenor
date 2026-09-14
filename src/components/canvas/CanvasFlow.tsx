import { useCallback, useMemo, type MouseEvent, type ReactNode } from "react";
import {
  ReactFlow,
  SelectionMode,
  MarkerType,
  PanOnScrollMode,
  Background,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
} from "@xyflow/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types/convex";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { edgeTypes } from "@/components/edges/edgeTypes";
import { injectMarkerColor } from "@/components/edges/edgeStyleUtils";
import ContextMenu from "@/components/canvas/context-menus";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useCanvasNodes } from "@/hooks/useCanvasNodes";
import { useCanvasEdges } from "@/hooks/useCanvasEdges";
import { useCreateEdge } from "@/hooks/useCreateEdge";
import { useCanvasPasteHandler } from "@/hooks/useCanvasPasteHandler";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useDeleteCanvasElements } from "@/hooks/useDeleteCanvasElements";
import { useCanvasDropHandler } from "@/hooks/useCanvasDropHandler";
import CanvasDropOverlay from "./CanvasDropOverlay";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";
import { copyNodesToClipboard } from "@/stores/nodeClipboardStore";
import { useCreateNodeHotkeys } from "@/hooks/useCreateNodeHotkeys";
import { isEditableTarget } from "@/lib/editableTarget";
import { withTouchDragGate } from "./touchDragGate";
import { markCanvasMoved } from "@/lib/canvasPanGesture";
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from "@/lib/canvasViewportFraming";
import { useInitialViewportFromUrl } from "@/hooks/useInitialViewportFromUrl";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  resolveCanvasBackground,
  toReactFlowVariant,
  type CanvasBackground,
} from "@/lib/canvasBackground";
import { useEdgeEditorStore } from "@/stores/edgeEditorStore";
import { useNoleStore } from "@/stores/noleStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTouchFirst } from "@/hooks/useTabletMode";
import "@xyflow/react/dist/style.css";
import { getNodeCapabilities } from "@/../convex/config/nodeConfig";
import { generateLlmId } from "@/../convex/lib/llmId";
import {
  FALLBACK_NODE_HEIGHT,
  FALLBACK_NODE_WIDTH,
  getBestTargetHandle,
  getClosestHandlesForDirectedEdge,
  parseSourceSide,
  type ConnectionNodeRect,
} from "@/lib/connectionHandles";
import type {
  ConnectedNodeCreatedInfo,
  PendingCanvasConnection,
} from "@/types/ui/context-menu.types";

/**
 * `desktop` : souris et clavier, sélection au lasso, menu contextuel.
 * `touch`   : doigt. On pan à un doigt, on ne drague un node qu'une fois
 *             sélectionné, et le double-tap sert à ouvrir un node — donc pas de
 *             zoom au double-clic.
 */
export type CanvasFlowVariant = "desktop" | "touch";

interface CanvasFlowProps {
  canvasId: Id<"canvases">;
  canvasNodes: CanvasNode[] | undefined;
  canvasEdges: Edge[] | undefined;
  /** `_permission` du canvas : les viewers ne peuvent pas dupliquer. */
  canEdit: boolean;
  variant: CanvasFlowVariant;
  /** Fond partagé du canvas ; absent => défauts front (cf. canvasBackground.ts). */
  background?: CanvasBackground;
  /** Les `<Panel>` propres à la plateforme. */
  children?: ReactNode;
}

/**
 * Le canvas React Flow, partagé entre desktop et mobile. Tout ce qui est commun
 * (état des nodes/edges, persistance, raccourcis, fond, menu contextuel) vit
 * ici ; seuls les panneaux diffèrent et arrivent par `children`.
 */
export default function CanvasFlow({
  canvasId,
  canvasNodes,
  canvasEdges,
  canEdit,
  variant,
  background,
  children,
}: CanvasFlowProps) {
  const isTouch = variant === "touch";
  const isMobile = useIsMobile();
  const isTouchFirst = useIsTouchFirst();
  // On touch-first devices (phones, tablets like the Boox), dragging on the
  // pane should pan the canvas instead of drawing a selection rectangle.
  const panWithFinger = isTouch || isMobile || isTouchFirst;

  // Handle paste events (images, URLs, nodes copiés via Ctrl+C)
  useCanvasPasteHandler({ canEdit });

  // Handle files/links/text dropped anywhere on the window
  const { isDraggingOver } = useCanvasDropHandler({ canEdit });

  // Context menu management
  const {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onSelectionContextMenu,
    onEdgeContextMenu,
  } = useContextMenu();

  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();
  // Ouvre le canvas sur le cadrage d'un lien partagé (`?v=cx,cy,zoom`).
  // Ici plutôt que dans la route : ce composant est le canvas des deux
  // surfaces, desktop et mobile.
  const { onFlowInit, isPending: isUrlViewportPending } =
    useInitialViewportFromUrl();
  const addNoleAttachments = useNoleStore((state) => state.addAttachments);
  const focus = useCanvasStore((state) => state.focus);
  const { duplicateNodes } = useDuplicateNode();
  const canDuplicateNodes = canEdit;

  const onNodeClick = useCallback(
    (event: MouseEvent, node: Parameters<typeof fromXyNodeToCanvasNode>[0]) => {
      if (!event.altKey) {
        return;
      }

      // Types non mentionnables (cf. `capabilities` dans nodeConfig) :
      // l'alt+clic est l'autre porte d'entrée vers le chat, elle se ferme
      // avec la mention.
      if (node.type && !getNodeCapabilities(node.type).mentionable) {
        return;
      }

      event.preventDefault();
      addNoleAttachments({ nodes: [fromXyNodeToCanvasNode(node)] }, true);
    },
    [addNoleAttachments],
  );

  const onPaneClick = useCallback(
    (event: MouseEvent) => {
      if (!event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNoleAttachments({ position });
    },
    [addNoleAttachments, screenToFlowPosition],
  );

  useHotkey(
    "Mod+D",
    (event) => {
      if (!canDuplicateNodes || event.repeat || focus !== "canvas") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const selectedNodes = getNodes().filter((node) => node.selected);
      if (selectedNodes.length === 0) {
        return;
      }

      event.preventDefault();
      void duplicateNodes(selectedNodes);
    },
    // `ignoreInputs` est obligatoire sur un combo Mod : la lib le met à `false`
    // par défaut pour eux (`getDefaultIgnoreInputs`) et applique
    // `preventDefault`/`stopPropagation` AVANT d'appeler le callback. Le test
    // `isEditableTarget` ci-dessus arrive donc trop tard — sans cette option,
    // le raccourci natif est déjà cassé dans un champ de saisie.
    { enabled: canDuplicateNodes && focus === "canvas", ignoreInputs: true },
  );

  // Copier la sélection dans le presse-papiers interne ; le coller (Ctrl+V)
  // est le fallback du handler `paste` (`useCanvasPasteHandler`), pas un
  // keydown : le contenu externe (fichiers, texte) garde ainsi la priorité
  // quand le clipboard système n'est pas vide.
  useHotkey(
    "Mod+C",
    (event) => {
      if (!canDuplicateNodes || event.repeat || focus !== "canvas") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const selectedNodes = getNodes().filter((node) => node.selected);
      if (copyNodesToClipboard(selectedNodes)) {
        event.preventDefault();
        // Le `preventDefault` ne vide pas le clipboard système : sans ça, un
        // texte copié avant continuerait de prendre le pas sur les nodes au
        // prochain Ctrl+V (le handler `paste` privilégie le contenu externe).
        // Vider = sémantique standard d'un « copier » (last-write-wins). Échec
        // silencieux hors contexte sécurisé : le coller de nodes reste le
        // fallback quand il n'y a ni fichiers ni texte.
        try {
          void navigator.clipboard?.writeText("").catch(() => {});
        } catch {
          /* clipboard système indisponible */
        }
      }
    },
    // Cf. Mod+D : sans `ignoreInputs`, un Ctrl+C dans une cellule de table ou
    // le composer de Nolë — surfaces qui ne touchent pas au store de focus —
    // voyait sa copie navigateur annulée.
    { enabled: canDuplicateNodes && focus === "canvas", ignoreInputs: true },
  );

  // Création d'un node au curseur (T titre, B blocknote, I image, A table,
  // V repère de navigation)
  useCreateNodeHotkeys({ canEdit, isTouch });

  // ── Suppression au clavier ──────────────────────────────────────────────
  // React Flow sait le faire tout seul (prop `deleteKeyCode`), mais son
  // handler appelle `deleteElements` en interne
  // (`useGlobalKeyHandler`) : il court-circuiterait
  // `useDeleteCanvasElements`, et donc l'historique. Les nodes partiraient
  // bien, mais sans laisser d'entrée — et le Ctrl+Z suivant annulerait le
  // geste d'AVANT, ce qui est pire que pas d'annulation du tout. D'où le
  // `deleteKeyCode={null}` conservé plus bas, et ce raccourci qui repasse par
  // l'entonnoir commun à tous les points de suppression.
  const { deleteCanvasElements } = useDeleteCanvasElements();
  const deleteSelection = useCallback(
    (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;

      const nodes = getNodes().filter((node) => node.selected);
      const edges = getEdges().filter((edge) => edge.selected);
      if (nodes.length === 0 && edges.length === 0) return;

      void deleteCanvasElements(
        { nodes, edges },
        { label: "Delete selection" },
      );
    },
    [deleteCanvasElements, getEdges, getNodes],
  );

  // `ignoreInputs` vaut déjà `true` par défaut pour une touche nue, mais on
  // l'écrit : Backspace est destructif, et c'est ce qui garantit qu'il efface
  // du texte dans un champ plutôt que la sélection derrière.
  //
  // `focus === "canvas"` est gardé ici, contrairement à Ctrl+Z juste au-dessus,
  // et l'asymétrie est voulue : les deux modes d'échec ne coûtent pas le même
  // prix. Un focus resté coincé rend l'annulation muette — pénible ; il rend la
  // suppression inerte — sans danger. Pour un geste destructif, on préfère
  // douter.
  useHotkey("Delete", deleteSelection, {
    enabled: canEdit && focus === "canvas",
    ignoreInputs: true,
  });
  useHotkey("Backspace", deleteSelection, {
    enabled: canEdit && focus === "canvas",
    ignoreInputs: true,
  });

  // ── Annulation ──────────────────────────────────────────────────────────
  // La pile ne contient que les gestes de CET utilisateur dans CET onglet :
  // ni les écritures de Nolë, ni celles d'un collaborateur (cf.
  // `canvasHistoryStore`). Elle couvre la mise en page et la structure ; le
  // contenu d'un node garde l'undo de son propre éditeur.
  const { undo, redo, canUndo, canRedo } = useCanvasHistory(canvasId);

  // Ce qui sépare notre Ctrl+Z de celui de BlockNote, c'est `ignoreInputs`,
  // pas le store de focus. La lib écarte la registration AVANT de matcher et
  // AVANT tout `preventDefault` dès que l'événement vient d'un input, d'un
  // textarea ou d'un contenteditable : ProseMirror reçoit sa frappe intacte.
  // C'est un signal vivant, évalué à chaque touche, là où le store est un
  // miroir qui peut se désynchroniser.
  //
  // D'où l'absence volontaire de `focus === "canvas"` ici, contrairement aux
  // autres raccourcis du fichier. Ce test échangerait un risque bénin — un
  // Ctrl+Z sur un menu portalé de BlockNote annulerait un geste du canvas,
  // rattrapable d'un Ctrl+Shift+Z — contre un risque bien pire : un focus
  // resté bloqué sur `richtext-editor` rendrait l'annulation définitivement
  // muette, sans rien pour l'expliquer. `modal` reste en garde, lui : une
  // modale possède réellement le clavier, et son garde est porté par un
  // montage/démontage, donc il ne peut pas se coincer.
  const historyEnabled = canEdit && focus !== "modal";

  useHotkey(
    "Mod+Z",
    (event) => {
      // Ceinture et bretelles : `ignoreInputs` ne couvre pas un focus sorti du
      // champ mais resté dans la surface d'édition (cf. `useCreateNodeHotkeys`).
      if (isEditableTarget(event.target)) return;
      void undo();
    },
    { enabled: historyEnabled && canUndo, ignoreInputs: true },
  );

  // Mod+Shift+Z et Mod+Y : les deux conventions de « refaire ». Les
  // modificateurs sont comparés à l'identique, donc Mod+Z ne se déclenche pas
  // quand Shift est tenu.
  useHotkey(
    "Mod+Shift+Z",
    (event) => {
      if (isEditableTarget(event.target)) return;
      void redo();
    },
    { enabled: historyEnabled && canRedo, ignoreInputs: true },
  );

  useHotkey(
    "Mod+Y",
    (event) => {
      if (isEditableTarget(event.target)) return;
      void redo();
    },
    { enabled: historyEnabled && canRedo, ignoreInputs: true },
  );

  // Canvas nodes management
  const { nodes, handleNodeChange } = useCanvasNodes(canvasId, canvasNodes);

  // Canvas edges management
  const { edges, setEdges, handleEdgeChange } = useCanvasEdges(
    canvasId,
    canvasEdges,
  );
  const { createEdge } = useCreateEdge();

  // Inject edge color into marker objects so React Flow renders colored arrows
  const edgesWithColoredMarkers = useMemo(
    () => injectMarkerColor(edges),
    [edges],
  );

  // Le gate tactile s'applique uniquement au tableau donné à <ReactFlow> : il ne
  // doit jamais remonter dans la persistance (cf. commentaire de la fonction).
  const flowNodes = useMemo(
    () => (isTouch ? withTouchDragGate(nodes) : nodes),
    [isTouch, nodes],
  );

  // Double-click an edge → enter label edit mode (handled inside CustomEdge
  // via the edgeEditorStore).
  const onEdgeDoubleClick = useCallback(
    (_e: MouseEvent, edge: { id: string }) => {
      useEdgeEditorStore.getState().setEditingEdgeId(edge.id);
    },
    [],
  );

  // Mémoïsé, et pas une arrow dans le JSX : `<ReactFlow>` repousse ses props
  // dans le store à chaque rendu, donc une nouvelle référence par rendu ajoute
  // une notification du store — donc un tour de tous les sélecteurs de tous les
  // nodes. Pendant un drag, `setNodes` re-rend ce composant à chaque frame :
  // c'était une notification de trop, par frame.
  // Un node ne peut pas être connecté à lui-même : on refuse la connexion.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => connection.source !== connection.target,
    [],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // Destructurés avant la garde : le narrowing doit survivre dans le
      // callback `.catch` (les paramètres ne le conservent pas).
      const { source, target } = params;
      const sourceHandle = params.sourceHandle ?? undefined;
      const targetHandle = params.targetHandle ?? undefined;
      if (!source || !target || source === target) {
        return;
      }
      // Local-first : l'edge apparaît au relâcher du geste avec son llmId
      // définitif (généré client, préservé par le serveur) — le markerEnd
      // explicite est identique au default serveur. En échec, on retire
      // l'edge en local uniquement : pas de `trash` serveur d'un edge
      // jamais créé.
      const { edgeId, settled } = createEdge({
        source,
        target,
        sourceHandle,
        targetHandle,
      });
      handleEdgeChange([
        {
          type: "add" as const,
          item: {
            id: edgeId,
            source,
            target,
            sourceHandle,
            targetHandle,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 30,
              height: 30,
              strokeWidth: 1,
            },
          },
        },
      ]);
      void settled.catch(() => {
        setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      });
    },
    [createEdge, handleEdgeChange, setEdges],
  );

  // Drag d'un handle source lâché dans le vide : ouvre le menu « Add a node »
  // au point de drop. Desktop uniquement (`panWithFinger` couvre tactile,
  // mobile et touch-first) : au doigt, le drag part en pan. `toNode` non nul
  // = drop sur un node, `onConnect` a déjà pris le relais. Les handles
  // cibles sont invisibles hors connexion : seul un drag source est possible.
  const handleConnectEnd = useCallback(
    (
      event: globalThis.MouseEvent | globalThis.TouchEvent,
      connectionState: FinalConnectionState,
    ) => {
      if (panWithFinger || !canEdit) {
        return;
      }
      if (connectionState.toNode) {
        return;
      }
      const fromNode = connectionState.fromNode;
      const fromHandle = connectionState.fromHandle;
      if (!fromNode || !fromHandle || fromHandle.type !== "source") {
        return;
      }
      // Lâché hors du canvas (sidebar, panneau) : rien à poser.
      const target = event.target as Element | null;
      if (
        target &&
        typeof target.closest === "function" &&
        !target.closest(".react-flow")
      ) {
        return;
      }
      let clientX: number | null = null;
      let clientY: number | null = null;
      if ("changedTouches" in event) {
        const touch = event.changedTouches[0] ?? event.touches[0];
        if (touch) {
          clientX = touch.clientX;
          clientY = touch.clientY;
        }
      } else {
        clientX = event.clientX;
        clientY = event.clientY;
      }
      if (clientX == null || clientY == null) {
        return;
      }
      const pending: PendingCanvasConnection = {
        sourceNodeId: fromNode.id,
        sourceHandleId: fromHandle.id ?? null,
        dropFlowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
      };
      setContextMenu({
        type: "canvas",
        position: { x: clientX, y: clientY },
        element: pending,
      });
    },
    [panWithFinger, canEdit, screenToFlowPosition, setContextMenu],
  );

  // Chaînage de l'edge après création du node depuis un drag dans le vide :
  // le handle source reste celui attrapé par l'utilisateur, seul le handle
  // cible du nouveau node est calculé (le plus proche du point source).
  // L'edge visuelle est posée aussitôt (même frame que le node) ; sa
  // persistance attend la confirmation serveur du node — le serveur refuse
  // une edge vers un node pas encore commité.
  const handleConnectionNodeCreated = useCallback(
    (info: ConnectedNodeCreatedInfo) => {
      const { pendingConnection, nodeId, position } = info;
      if (nodeId === pendingConnection.sourceNodeId) {
        return;
      }
      const sourceNode = getNodes().find(
        (node) => node.id === pendingConnection.sourceNodeId,
      );
      if (!sourceNode) {
        return;
      }
      const sourceRect: ConnectionNodeRect = {
        id: sourceNode.id,
        position: { ...sourceNode.position },
        width:
          sourceNode.measured?.width ??
          sourceNode.width ??
          FALLBACK_NODE_WIDTH,
        height:
          sourceNode.measured?.height ??
          sourceNode.height ??
          FALLBACK_NODE_HEIGHT,
      };
      const targetRect: ConnectionNodeRect = {
        id: nodeId,
        position: { ...position },
        width: info.width,
        height: info.height,
      };
      const sourceSide = parseSourceSide(pendingConnection.sourceHandleId);
      let sourceHandle: string;
      let targetHandle: string;
      if (pendingConnection.sourceHandleId && sourceSide) {
        sourceHandle = pendingConnection.sourceHandleId;
        targetHandle = getBestTargetHandle({
          sourceRect,
          sourceSide,
          target: targetRect,
        });
      } else {
        const handles = getClosestHandlesForDirectedEdge({
          from: sourceRect,
          to: targetRect,
        });
        sourceHandle = handles.sourceHandle;
        targetHandle = handles.targetHandle;
      }
      // Id pré-généré : le visuel et la persistance (différée) partagent le
      // même llmId, préservé tel quel par le serveur.
      const edgeId = generateLlmId();
      const removeLocalEdge = () => {
        setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      };
      handleEdgeChange([
        {
          type: "add" as const,
          item: {
            id: edgeId,
            source: sourceRect.id,
            target: nodeId,
            sourceHandle,
            targetHandle,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 30,
              height: 30,
              strokeWidth: 1,
            },
          },
        },
      ]);
      // Persistance différée : le node doit exister côté serveur avant l'edge.
      // Échec du node (toast + rollback déjà gérés par son hook) : on retire
      // l'edge orpheline, sans second toast.
      void info.nodeSettled.then(
        () => {
          const { settled } = createEdge({
            edgeId,
            source: sourceRect.id,
            target: nodeId,
            sourceHandle,
            targetHandle,
          });
          void settled.catch(removeLocalEdge);
        },
        removeLocalEdge,
      );
    },
    [createEdge, getNodes, handleEdgeChange, setEdges],
  );

  // Fond partagé : stocké sur le doc canvas, défauts front si absent
  // (nouveaux canvas + anciens sans champ). `none` => pas de motif.
  const resolvedBackground = useMemo(
    () => resolveCanvasBackground(background),
    [background],
  );
  const backgroundVariant = toReactFlowVariant(resolvedBackground.variant);

  return (
    <>
      {isDraggingOver && <CanvasDropOverlay />}
      <ReactFlow
        onInit={onFlowInit}
        // Le canvas reste invisible le temps qu'un cadrage venu de l'URL
        // soit posé, sinon la première frame se peint au `defaultViewport`
        // puis saute à la cible (cf. `useInitialViewportFromUrl`).
        // `opacity` et non `visibility`/`display` : le pane doit rester
        // mesurable, `getPaneRect` en dépend.
        className={cn(isUrlViewportPending && "opacity-0")}
        panOnScroll
        // Explicite (défauts React Flow) : fige l'anti swipe-back trackpad
        // contre un changement de défaut — `preventScrolling` bloque le scroll
        // navigateur, `free` garde le pan 2-doigts horizontal/vertical.
        preventScrolling
        panOnScrollMode={PanOnScrollMode.Free}
        // Au doigt, le drag sur le pane pan toujours. À la souris, on garde le
        // clic molette pour panner et on laisse le clic gauche au lasso.
        panOnDrag={panWithFinger ? true : [1]}
        // Le cas sans `?v=` : tout canvas s'ouvre à l'origine du monde.
        defaultViewport={{
          x: 0,
          y: 0,
          zoom: 0.75,
        }}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        selectNodesOnDrag={false}
        // Sans ça React Flow ajoute +1000 au z d'un node sélectionné : le
        // "send to back" ne se verrait pas tant que le node reste sélectionné.
        // La sélection reste signalée par le ring de NodeFrame, qui ne dépend
        // pas du z. Cf. l'override de .react-flow__node-toolbar dans index.css.
        elevateNodesOnSelect={false}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={!panWithFinger}
        // Tactile : draggable est accordé node par node via withTouchDragGate.
        nodesDraggable={!isTouch}
        // Tactile : le double-tap sert à ouvrir un node, pas à zoomer.
        zoomOnDoubleClick={!isTouch}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onNodeClick={onNodeClick}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeDoubleClick={onEdgeDoubleClick}
        // Tient à jour le geste de pan en cours : les nodes qui capturent la
        // molette s'en servent pour ne pas interrompre un pan démarré ailleurs.
        // En pan-on-scroll, React Flow n'émet `onMove` qu'à partir du 2e événement
        // du geste, d'où `onMoveStart` en plus.
        onMoveStart={markCanvasMoved}
        onMove={markCanvasMoved}
        // Volontaire : la suppression clavier passe par notre propre
        // raccourci, pour rester annulable (cf. plus haut).
        deleteKeyCode={null}
        nodes={flowNodes}
        edges={edgesWithColoredMarkers}
        onEdgesChange={handleEdgeChange}
        onNodesChange={handleNodeChange}
        onConnect={onConnect}
        // Desktop uniquement : au doigt, le drag sur le pane pan toujours et
        // les viewers (`!canEdit`) ne créent rien.
        onConnectEnd={
          !canEdit || panWithFinger ? undefined : handleConnectEnd
        }
        isValidConnection={isValidConnection}
      >
        {backgroundVariant ? (
          <Background
            variant={backgroundVariant}
            color={resolvedBackground.patternColor}
            bgColor={resolvedBackground.bgColor}
            gap={resolvedBackground.gap}
            size={
              resolvedBackground.variant === "lines"
                ? undefined
                : resolvedBackground.size
            }
            lineWidth={
              resolvedBackground.variant === "lines"
                ? resolvedBackground.size
                : undefined
            }
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: resolvedBackground.bgColor }}
          />
        )}
        {children}
        {contextMenu.type && (
          <ContextMenu
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
            onConnectionNodeCreated={handleConnectionNodeCreated}
          />
        )}
      </ReactFlow>
    </>
  );
}
