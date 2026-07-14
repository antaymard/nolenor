import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/shadcn/dropdown-menu";
import type { EdgeBendPoint } from "@/types/domain";
import { TbX } from "react-icons/tb";

/**
 * A draggable handle rendered on top of an edge at a bend point's position.
 *
 * - Pointer drag → calls `onDrag` with the new flow-space position (live,
 *   non-persisting) on every move and `onDragEnd` once on release (persist).
 * - Right-click → opens a small context menu with a "Remove point" action.
 */
export default function EdgeBendHandle({
  bendPoint,
  onDrag,
  onDragEnd,
  onRemove,
}: {
  bendPoint: EdgeBendPoint;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
  onRemove: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [menuPos, setMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // only left button drags
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
      return;
    }
    e.preventDefault();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDrag(pos.x, pos.y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
      return;
    }
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    onDragEnd();
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        style={{
          position: "absolute",
          transform: `translate(-50%, -50%) translate(${bendPoint.x}px, ${bendPoint.y}px)`,
          pointerEvents: "all",
          width: 12,
          height: 12,
          borderRadius: 9999,
          background: "#ffffff",
          border: "2px solid #3b82f6",
          cursor: "grab",
          touchAction: "none",
        }}
        className="nodrag nopan hover:border-blue-600 hover:bg-blue-50 hover:shadow-md active:cursor-grabbing transition-colors"
        title="Drag to reshape · Right-click to remove"
      />

      <DropdownMenu
        open={menuPos !== null}
        onOpenChange={(open) => {
          if (!open) setMenuPos(null);
        }}
      >
        <DropdownMenuContent
          style={
            menuPos
              ? {
                  position: "fixed",
                  top: menuPos.y,
                  left: menuPos.x,
                }
              : undefined
          }
          onContextMenu={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            onClick={() => {
              setMenuPos(null);
              onRemove();
            }}
          >
            <TbX size={16} /> Remove point
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
