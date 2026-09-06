import type { CSSProperties } from "react";
import type { Cell, Header, Row } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { TbArrowsDiagonal, TbGripVertical } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { TableCell, TableHead, TableRow } from "@/components/shadcn/table";
import { cn } from "@/lib/utils";
import { sortableCellStyle, useSortableCellStyle } from "./sortableCell";
import type { TableRowData } from "./types";

// Les briques dnd de la grille. Elles ne lisent aucun état de `Table` — tout
// passe par des props — et occupaient un tiers du fichier avant qu'on n'y
// arrive.

export function DraggableHeader({
  header,
  canDrag,
  children,
}: {
  header: Header<TableRowData, unknown>;
  canDrag: boolean;
  children: (props: { dragHandle?: React.ReactNode }) => React.ReactNode;
}) {
  const { isDragging, listeners, setNodeRef, transform } = useSortable({
    id: header.column.id,
    disabled: !canDrag,
  });
  const isResizing = header.column.getIsResizing();
  const style: CSSProperties = {
    ...sortableCellStyle(transform, isDragging, header.getSize()),
    // `position: sticky` écrit ICI, et non via une classe : le style inline de
    // `sortableCellStyle` pose `position: relative`, qui gagne sur la classe
    // Tailwind. C'est ce qui faisait défiler l'en-tête alors que les deux
    // colonnes techniques — seules à ne pas avoir de style inline — restaient
    // collées, ce qui rendait le symptôme particulièrement trompeur.
    position: "sticky",
    top: 0,
    transition: isResizing
      ? "transform 0.2s ease-in-out"
      : "width transform 0.2s ease-in-out",
    zIndex: isDragging ? 30 : 20,
    userSelect: isResizing ? "none" : undefined,
  };
  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className="group/head bg-background"
    >
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          {children({
            dragHandle: canDrag ? (
              <span
                {...listeners}
                role="presentation"
                className="absolute inset-0 cursor-grab text-muted-foreground/60 opacity-0 group-hover/head:opacity-100 hover:text-foreground active:cursor-grabbing"
                title="Drag to reorder"
              >
                <TbGripVertical size={13} />
              </span>
            ) : undefined,
          })}
        </div>
      </div>
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        className={cn(
          "absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-border",
          isResizing && "bg-primary/60",
        )}
      />
    </TableHead>
  );
}

export function DraggableCell({
  cell,
  onCellClick,
  children,
}: {
  cell: Cell<TableRowData, unknown>;
  onCellClick?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, style } = useSortableCellStyle(
    cell.column.id,
    cell.column.getSize(),
  );
  return (
    <TableCell
      ref={setNodeRef}
      style={style}
      onClick={onCellClick}
      // Le `whitespace-nowrap` du TableCell shadcn est partagé par toute l'app :
      // on le neutralise ici plutôt que de le retirer là-bas.
      className={cn(
        "align-top whitespace-normal",
        onCellClick && "cursor-text",
      )}
    >
      {children}
    </TableCell>
  );
}

export function RowGutter({
  index,
  canDrag,
  attributes,
  listeners,
  setActivatorNodeRef,
  onExpand,
}: {
  index: number;
  canDrag: boolean;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  onExpand?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums opacity-60 group-hover/tablerow:opacity-0">
        {index + 1}
      </span>
      <div className="-ml-5 flex items-center opacity-0 group-hover/tablerow:opacity-100">
        {canDrag ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            tabIndex={-1}
            title="Drag to reorder"
          >
            <TbGripVertical size={13} />
          </button>
        ) : (
          <span className="w-[13px]" />
        )}
        {onExpand && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-5"
            onClick={onExpand}
            title="Open row"
          >
            <TbArrowsDiagonal size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

export function DraggableRow({
  row,
  canDrag,
  children,
}: {
  row: Row<TableRowData>;
  canDrag: boolean;
  children: (dragHandleProps: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    transform,
    transition,
    setActivatorNodeRef,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: row.original.id,
    disabled: !canDrag,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: "relative",
  };
  return (
    <TableRow ref={setNodeRef} style={style} className="group/tablerow">
      {children({ attributes, listeners, setActivatorNodeRef })}
    </TableRow>
  );
}

