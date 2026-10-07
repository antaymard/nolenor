import { NodeResizer, useStore, useUpdateNodeInternals } from "@xyflow/react";
import { memo, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { colors } from "@/components/ui/styles";
import type { XyNodeProps } from "@/types/domain";
import NodeHandles from "./NodeHandles";
import { useWindowsStore } from "@/stores/windowsStore";
import { useIsNodeAttached } from "@/stores/noleStore";
import { useIsNodeBookmarked } from "@/stores/bookmarkedNodesStore";
import { useNoleNodeActivity } from "@/stores/noleLiveStore";
import NoleActivityBead from "./NoleActivityBead";
import BookmarkedBadge from "./BookmarkedBadge";
import RemoteSelectionPill from "@/components/canvas/presence/RemoteSelectionPill";
import { NodeTitleHeader } from "./NodeHeader";
import { useNodeDisplayOptions } from "@/hooks/useNodeDisplayOptions";
import { zoomCompensationScaleSelector } from "@/lib/zoomCompensation";

/**
 * Option `scaleWithZoom` : la boîte visuelle du node (cadre, ring de
 * sélection, pastille, contenu) garde sa taille à l'écran quand on dézoome,
 * comme le titre des frames. Elle grandit depuis son centre, autour de la
 * boîte réelle, que les edges continuent de viser.
 *
 * Passe aussi le node au premier plan (classe `zoom-compensated`, cf.
 * index.css) : il grossit par-dessus ses voisins, il ne doit pas passer dessous.
 *
 * Composant à part pour que seuls les nodes qui ont l'option s'abonnent au
 * zoom. Les handles et le resizer restent hors de l'échelle : React Flow les
 * mesure, une mesure sous `scale` fausserait les edges.
 */
function ZoomCompensated({ children }: { children: React.ReactNode }) {
  const scale = useStore(zoomCompensationScaleSelector);
  return (
    <div
      className="zoom-compensated h-full"
      style={{ scale: String(scale), transformOrigin: "center" }}
    >
      {children}
    </div>
  );
}

/**
 * Les handles d'un node `scaleWithZoom`, posés sur les bords de sa boîte
 * VISIBLE (agrandie autour de son centre) et à la même échelle qu'elle.
 * Restés sur la boîte réelle, ils tombaient au milieu du texte une fois
 * dézoomé, et rétrécissaient à deux pixels : impossible de partir de ce node.
 *
 * Un `inset` négatif plutôt qu'un `scale` sur le conteneur : un `scale`
 * créerait un contexte d'empilement, et la boîte, rendue après, passerait
 * par-dessus les handles visibles. En pourcentages, `top`/`bottom` se lisent
 * sur la hauteur et `left`/`right` sur la largeur : c'est exactement la
 * boîte agrandie de `ZoomCompensated`.
 *
 * React Flow ne remesure les handles qu'au resize du node, que le zoom ne
 * déclenche pas : on le lui demande à chaque changement d'échelle, sinon le
 * départ d'une connexion et la recherche du handle cible liraient des
 * positions périmées. Les edges, elles, s'accrochent à la boîte réelle (cf.
 * `CustomEdge`).
 */
function ZoomCompensatedHandles({
  nodeId,
  showSourceHandles,
}: {
  nodeId: string;
  showSourceHandles: boolean;
}) {
  const scale = useStore(zoomCompensationScaleSelector);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [scale, nodeId, updateNodeInternals]);

  return (
    <div
      className="pointer-events-none absolute"
      style={{ inset: `${((1 - scale) / 2) * 100}%` }}
    >
      <NodeHandles
        showSourceHandles={showSourceHandles}
        nodeId={nodeId}
        scale={scale}
      />
    </div>
  );
}

function NodeFrame({
  xyNode,
  children,
  resizable = true,
  minWidth,
  minHeight,
  headerActions,
}: {
  xyNode: XyNodeProps;
  children: React.ReactNode;
  resizable?: boolean;
  minWidth?: number;
  minHeight?: number;
  /**
   * Boutons de l'en-tête titre (option `showTitle`), ex. le Refresh d'une
   * app. Ignoré quand l'en-tête n'est pas affiché.
   */
  headerActions?: React.ReactNode;
}) {
  // `||` et non `??` : une couleur vide vaut "default", comme avant le typage.
  const nodeColor = colors[xyNode.data.color || "default"];
  const isTransparent = xyNode.data.color === "transparent";
  const [isResizing, setIsResizing] = useState(false);
  // Stables, et c'est ce qui rend le resize possible au doigt : `ResizeControl`
  // (@xyflow/react) recrée son drag d3 dès qu'un de ses callbacks change, ce
  // qui rebranche les listeners sur la poignée. À la souris ça passe (d3 écoute
  // `mousemove` sur window), mais au toucher `touchmove` est écouté sur la
  // poignée elle-même : le nouveau drag n'y connaît pas le doigt en cours, et
  // le geste s'arrêtait au premier rerender — un tick de resize, puis plus rien.
  const handleResizeStart = useCallback(() => setIsResizing(true), []);
  const handleResizeEnd = useCallback(() => setIsResizing(false), []);
  const canDrag = true;
  const openWindow = useWindowsStore((state) => state.openWindow);
  const isAttachedToNole = useIsNodeAttached(xyNode.id);
  const isBookmarked = useIsNodeBookmarked(xyNode.id);
  const noleActivity = useNoleNodeActivity(xyNode.id);
  const nodeType = xyNode.type;

  // `openWindow` tranche lui-même si ce node a une window (type prébuilt
  // ouvrable, ou custom dont le template a un windowLayout) et ne fait rien
  // sinon — inutile de refaire le test ici. C'est aussi ce qui évite à
  // NodeFrame de s'abonner au template : il ne re-rend plus du tout sur ses
  // éditions.
  // Dépendance sur le seul `nodeDataId`, pas sur `data` : Convex recrée l'objet
  // à chaque sync (c'est pourquoi `areNodePropsEqual` le compare en surface),
  // et s'en rendre dépendant recréerait le callback pour rien.
  const { nodeDataId } = xyNode.data;
  const handleDoubleClick = useCallback(() => {
    if (!nodeDataId || !nodeType) return;

    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType });
  }, [nodeDataId, xyNode.id, nodeType, openWindow]);

  // L'en-tête titre est posé ici, pour tous les types, et non par chaque
  // node : proposer `showTitle` à un nouveau type tient alors en une ligne de
  // `nodeDisplayOptions.ts`. Le contenu du node passe dans un corps `flex-1`, où son
  // `h-full` vaut la hauteur restante.
  const { showTitle, scaleWithZoom } = useNodeDisplayOptions(xyNode);

  // Une iframe déverrouillée (cf. IframeInteractionGate) avale les pointermove :
  // drag et resize perdraient leurs frames dès que le curseur la survole. Le
  // gate se reverrouille de lui-même sur `dragging`, mais pas sur le resize,
  // dont l'état ne vit qu'ici.
  const needsPointerShieldWhileMoving =
    nodeType === "app" ||
    (nodeType === "link" && xyNode.data.variant === "embed");

  // La boîte visuelle du node. Hors de l'échelle `scaleWithZoom` : les
  // handles et le resizer rendus à côté (cf. `ZoomCompensated`).
  const box = (
    <div
      className={cn(
        "relative rounded-xl text-card-foreground",
        // PAS de `overflow-hidden` ici : il rognerait l'outline pointillé
        // violet du node attaché à Nolë (`after:` en `-inset-1`, donc hors
        // boîte). Le clip du contenu vit sur le conteneur interne, qui a
        // lui le rayon de la face interne de la bordure (14px - 1px).
        // `transition-[…]` explicite, et pas un `duration-150` nu : la valeur
        // initiale CSS de `transition-property` étant `all`, la durée seule
        // rendait *toute* propriété animable sur chaque node — donc 150 ms de
        // repaint au moindre changement de style, ring de survol compris.
        "group h-full flex flex-col border animate-node-appear",
        "transition-[box-shadow,border-color,transform] duration-200 ease-out",
        nodeColor.nodeBg,
        nodeColor.nodeBorder,
        !isTransparent && "shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
        isAttachedToNole &&
          "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[18px] after:border-2 after:border-dashed after:border-violet-500/90",
        // Halo de Nolë sur ce node. `before:` pour ne pas entrer en conflit
        // avec l'outline du node attaché (`after:`). Les transitions font
        // glisser d'un état à l'autre (lecture en cours → déjà lu) et portent
        // le fondu de sortie (cf. lib/noleLiveActivity.ts).
        noleActivity &&
          "before:pointer-events-none before:absolute before:-inset-1.5 before:rounded-[20px] before:border-2 before:transition-[opacity,border-color,box-shadow] before:duration-500",
        noleActivity?.access === "read" &&
          "before:border-violet-400/60 before:shadow-[0_0_12px_rgba(139,92,246,0.25)]",
        noleActivity?.access === "write" &&
          cn(
            "before:border-violet-600 before:shadow-[0_0_16px_rgba(124,58,237,0.45)]",
            // Le pulse anime l'opacité : il masquerait le fondu.
            !noleActivity.leaving && "before:animate-pulse",
          ),
        // Déjà écrit / déjà lu par le run en cours : un repère discret,
        // jusqu'à sa fin.
        noleActivity?.access === "written" && "before:border-violet-500/40",
        noleActivity?.access === "seen" && "before:border-violet-400/20",
        noleActivity?.leaving && "before:opacity-0",
        !canDrag && "nodrag",
        xyNode.selected
          ? cn(
              "ring-2 ring-blue-500/70",
              !isTransparent && "shadow-[0_3px_12px_rgba(15,23,42,0.12)]",
            )
          : cn(
              "hover:ring-1 hover:ring-blue-400/60",
              !isTransparent && "hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]",
            ),
      )}
      onDoubleClick={handleDoubleClick}
    >
      {/* Pastille de repère. Sur la racine et pas dans le conteneur interne,
          qui porte `overflow-hidden` : elle déborde volontairement du coin
          (cf. `BookmarkedBadge`). */}
      {isBookmarked && <BookmarkedBadge />}

      {noleActivity && <NoleActivityBead activity={noleActivity} />}

      {/* `content-visibility: auto` : le navigateur saute le layout et le
          paint du contenu tant que le node est hors écran, ce qui borne le
          coût d'un pan au seul contenu visible. Sur le conteneur interne et
          non sur la racine du node : `content-visibility` implique
          `contain: paint`, qui rognerait le ring de sélection et les poignées
          du `NodeResizer`, tous deux rendus en dehors de ce div. Même patron
          que `BlocknoteNode`, qui l'applique déjà à son propre contenu. */}
      <div
        className={cn(
          // `overflow-hidden` + rayon de la face interne de la bordure
          // (rounded-xl = 14px, moins 1px de border) : c'est lui qui garantit
          // que le contenu (image, table, BlockNote, iframe) est rogné aux
          // coins du frame. Sans ça, un enfant à coins carrés dépassait.
          // La dernière fois on l'a mis sur le frame et ça avait rogné
          // l'outline du node attaché — d'où ce placement.
          "h-full relative overflow-hidden rounded-[13px] [content-visibility:auto]",
          showTitle && "flex flex-col",
          xyNode.data.color === "transparent"
            ? "bg-transparent"
            : "bg-surface/80",
        )}
      >
        {needsPointerShieldWhileMoving && (isResizing || xyNode.dragging) && (
          <div className="absolute inset-0 z-10" />
        )}
        {showTitle ? (
          <>
            <NodeTitleHeader
              nodeDataId={nodeDataId}
              nodeType={nodeType}
              actions={headerActions}
            />
            <div className="relative flex-1 min-h-0">{children}</div>
          </>
        ) : (
          children
        )}
        {/* Qui d'autre a sélectionné ce node (présence du canvas). */}
        <RemoteSelectionPill nodeId={xyNode.id} />
      </div>
    </div>
  );

  return (
    <>
      {scaleWithZoom ? (
        <ZoomCompensatedHandles
          showSourceHandles={!!xyNode.selected}
          nodeId={xyNode.id}
        />
      ) : (
        <NodeHandles showSourceHandles={xyNode?.selected} nodeId={xyNode.id} />
      )}
      <NodeResizer
        isVisible={resizable && xyNode?.selected}
        minWidth={minWidth}
        minHeight={minHeight}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
        lineStyle={{
          borderWidth: 2,
        }}
        handleStyle={{
          height: 8,
          width: 8,
          borderRadius: 2,
          zIndex: 10,
        }}
      />
      {scaleWithZoom ? <ZoomCompensated>{box}</ZoomCompensated> : box}
    </>
  );
}

export default memo(NodeFrame);
