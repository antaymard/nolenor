import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  TbGripVertical,
  TbLayoutColumns,
  TbLayoutRows,
  TbPlus,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { fieldRegistry } from "@/components/fields/registry/fieldRegistry";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type {
  LayoutContainer,
  LayoutNode,
} from "@/../convex/config/templateConfig";
import {
  findLayoutNode,
  findParentId,
  moveLayoutNode,
  newContainer,
  insertLayoutNode,
} from "./templateDraft";

// Éditeur STRUCTUREL de l'arbre de layout : les containers sont des blocs
// imbriqués (toujours empilés verticalement ici, quel que soit leur
// direction — le rendu WYSIWYG est dans TemplatePreview). Drag pour
// réordonner / déplacer entre containers, clic pour sélectionner
// (PlacementInspector).

type LayoutCanvasProps = {
  tree: LayoutContainer;
  fields: TemplateField[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeTree: (tree: LayoutContainer) => void;
};

const INTO_PREFIX = "into:";

function DirectionIcon({ direction }: { direction: "row" | "column" }) {
  return direction === "row" ? (
    <TbLayoutColumns size={13} />
  ) : (
    <TbLayoutRows size={13} />
  );
}

function FieldRow({
  node,
  fields,
  selectedId,
  onSelect,
}: {
  node: Extract<LayoutNode, { kind: "field" }>;
  fields: TemplateField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const field = fields.find((f) => f.id === node.fieldId);
  const Icon = field ? fieldRegistry[field.type].icon : TbGripVertical;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded border bg-white px-2 py-1.5 text-sm",
        selectedId === node.id
          ? "border-violet-400 ring-1 ring-violet-300"
          : "border-gray-200 hover:border-gray-300",
        isDragging && "opacity-50",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-600 shrink-0"
      >
        <TbGripVertical size={13} />
      </button>
      <Icon size={13} className="text-gray-500 shrink-0" />
      <span className={cn("truncate", !field && "text-red-500 italic")}>
        {field ? field.name : "Unknown field"}
      </span>
      {node.showLabel && (
        <span className="ml-auto text-[10px] text-gray-400 shrink-0">
          label
        </span>
      )}
    </div>
  );
}

function ContainerBlock({
  container,
  fields,
  selectedId,
  onSelect,
  isRoot = false,
}: {
  container: LayoutContainer;
  fields: TemplateField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isRoot?: boolean;
}) {
  const sortable = useSortable({ id: container.id, disabled: isRoot });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${INTO_PREFIX}${container.id}`,
  });

  const body = (
    <div
      className={cn(
        "rounded-md border-2 border-dashed p-1.5 space-y-1.5",
        selectedId === container.id
          ? "border-violet-400 bg-violet-50/50"
          : "border-gray-200 bg-gray-50/50",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(container.id);
      }}
    >
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium px-0.5">
        {!isRoot && (
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            className="cursor-grab text-gray-400 hover:text-gray-600"
          >
            <TbGripVertical size={13} />
          </button>
        )}
        <DirectionIcon direction={container.direction} />
        <span>{container.direction === "row" ? "Row" : "Column"}</span>
        {isRoot && <span className="text-gray-400">(root)</span>}
      </div>

      <SortableContext
        items={container.children.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {container.children.map((child) =>
          child.kind === "container" ? (
            <ContainerBlock
              key={child.id}
              container={child}
              fields={fields}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : (
            <FieldRow
              key={child.id}
              node={child}
              fields={fields}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ),
        )}
      </SortableContext>

      <div
        ref={setDropRef}
        className={cn(
          "rounded border border-dashed text-center text-[10px] py-1 text-gray-400 transition-colors",
          isOver
            ? "border-violet-400 bg-violet-100 text-violet-600"
            : "border-gray-200",
          container.children.length === 0 ? "py-3" : "",
        )}
      >
        {container.children.length === 0 ? "Empty — drop here" : "Drop here"}
      </div>
    </div>
  );

  if (isRoot) return body;

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(sortable.isDragging && "opacity-50")}
    >
      {body}
    </div>
  );
}

export default function LayoutCanvas({
  tree,
  fields,
  selectedId,
  onSelect,
  onChangeTree,
}: LayoutCanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Drop dans la zone "into" d'un container → append à la fin.
    if (overId.startsWith(INTO_PREFIX)) {
      const containerId = overId.slice(INTO_PREFIX.length);
      if (containerId === activeId) return;
      onChangeTree(moveLayoutNode(tree, activeId, containerId, undefined));
      return;
    }

    const overParentId = findParentId(tree, overId);
    if (!overParentId) return;
    const overParent = findLayoutNode(tree, overParentId) as LayoutContainer;
    const activeParentId = findParentId(tree, activeId);

    if (activeParentId === overParentId) {
      // Réordonnancement dans le même container (sémantique arrayMove).
      const ids = overParent.children.map((c) => c.id);
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0) return;
      const reordered = arrayMove(overParent.children, from, to);
      const apply = (node: LayoutContainer): LayoutContainer =>
        node.id === overParentId
          ? { ...node, children: reordered }
          : {
              ...node,
              children: node.children.map((child) =>
                child.kind === "container" ? apply(child) : child,
              ),
            };
      onChangeTree(apply(tree));
    } else {
      const index = overParent.children.findIndex((c) => c.id === overId);
      onChangeTree(
        moveLayoutNode(tree, activeId, overParentId, Math.max(0, index)),
      );
    }
  }

  function handleAddContainer() {
    const selected = selectedId ? findLayoutNode(tree, selectedId) : null;
    const targetId =
      selected && selected.kind === "container" ? selected.id : tree.id;
    const container = newContainer("row");
    onChangeTree(insertLayoutNode(tree, targetId, undefined, container));
    onSelect(container.id);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleAddContainer}
        >
          <TbPlus size={12} className="mr-1" /> Container
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <ContainerBlock
          container={tree}
          fields={fields}
          selectedId={selectedId}
          onSelect={onSelect}
          isRoot
        />
      </DndContext>
    </div>
  );
}
