import { NodeResizer } from "@xyflow/react";
import { memo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { colors } from "@/components/ui/styles";
import type { XyNodeProps } from "@/types/domain";
import NodeHandles from "./NodeHandles";
import { useWindowsStore } from "@/stores/windowsStore";
import { useIsNodeAttached } from "@/stores/noleStore";

function NodeFrame({
  xyNode,
  children,
  resizable = true,
}: {
  xyNode: XyNodeProps;
  children: React.ReactNode;
  resizable?: boolean;
}) {
  // `||` et non `??` : une couleur vide vaut "default", comme avant le typage.
  const nodeColor = colors[xyNode.data.color || "default"];
  const [isResizing, setIsResizing] = useState(false);
  const canDrag = true;
  const openWindow = useWindowsStore((state) => state.openWindow);
  const isAttachedToNole = useIsNodeAttached(xyNode.id);
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

  // Une iframe déverrouillée (cf. IframeInteractionGate) avale les pointermove :
  // drag et resize perdraient leurs frames dès que le curseur la survole. Le
  // gate se reverrouille de lui-même sur `dragging`, mais pas sur le resize,
  // dont l'état ne vit qu'ici.
  const needsPointerShieldWhileMoving =
    nodeType === "app" || nodeType === "embed";

  return (
    <>
      <NodeHandles showSourceHandles={xyNode?.selected} nodeId={xyNode.id} />
      <NodeResizer
        isVisible={resizable && xyNode?.selected}
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
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
      <div
        className={cn(
          "relative rounded-[5px] text-card-foreground",
          // `transition-[…]` explicite, et pas un `duration-150` nu : la valeur
          // initiale CSS de `transition-property` étant `all`, la durée seule
          // rendait *toute* propriété animable sur chaque node — donc 150 ms de
          // repaint au moindre changement de style, ring de survol compris.
          "group h-full flex flex-col border animate-node-appear",
          "transition-[box-shadow,border-color] duration-150",
          nodeColor.nodeBg,
          nodeColor.nodeBorder,
          isAttachedToNole &&
            "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[8px] after:border-2 after:border-dashed after:border-violet-500/90",
          !canDrag && "nodrag",
          xyNode.selected
            ? "ring-2 ring-blue-500/70"
            : "hover:ring-1 hover:ring-blue-400/60",
        )}
        onDoubleClick={handleDoubleClick}
      >
        {/* `content-visibility: auto` : le navigateur saute le layout et le
            paint du contenu tant que le node est hors écran, ce qui borne le
            coût d'un pan au seul contenu visible. Sur le conteneur interne et
            non sur la racine du node : `content-visibility` implique
            `contain: paint`, qui rognerait le ring de sélection et les poignées
            du `NodeResizer`, tous deux rendus en dehors de ce div. Même patron
            que `BlocknoteNode`, qui l'applique déjà à son propre contenu. */}
        <div
          className={cn(
            "h-full rounded-[4px] relative [content-visibility:auto]",
            xyNode.data.color === "transparent"
              ? "bg-transparent"
              : "bg-white/80",
          )}
        >
          {needsPointerShieldWhileMoving && (isResizing || xyNode.dragging) && (
            <div className="absolute inset-0 z-10" />
          )}
          {children}
        </div>
      </div>
    </>
  );
}

export default memo(NodeFrame);
