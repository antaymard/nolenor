import { memo, useCallback, useEffect, useState } from "react";
import type { Node } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import { useNodeDataValues } from "@/hooks/useNodeData";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  TbChevronLeft,
  TbChevronRight,
  TbDownload,
  TbGripVertical,
  TbMaximize,
  TbPencil,
  TbPhoto,
  TbTrash,
} from "react-icons/tb";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { UploadFile } from "@/components/fields/UploadFile";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useWindowsStore } from "@/stores/windowsStore";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

type ImageItem = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: number;
  key?: string;
};

type Value = ImageItem[];

const defaultValue: Value = [];

function SortableImageItem({
  image,
  onDelete,
}: {
  image: ImageItem;
  onDelete: (url: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: image.url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-1.5 rounded-md border bg-background"
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <TbGripVertical size={16} />
      </button>
      <img
        src={image.url}
        alt={image.filename ?? "image"}
        className="h-10 w-10 rounded object-cover flex-shrink-0"
      />
      <span className="flex-1 text-sm truncate text-muted-foreground min-w-0">
        {image.filename ?? "image"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(image.url)}
      >
        <TbTrash size={14} />
      </Button>
    </div>
  );
}

function ImageEditDialog({
  nodeDataId,
  currentValue,
  onUploadComplete,
  onDelete,
  onReorder,
}: {
  nodeDataId: Id<"nodeDatas">;
  currentValue: Value;
  onUploadComplete: (fileData: {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: number;
    key: string;
  }) => void;
  onDelete: (url: string) => void;
  onReorder: (newImages: Value) => void;
}) {
  const [localImages, setLocalImages] = useState<Value>(currentValue);

  useEffect(() => {
    setLocalImages(currentValue);
  }, [currentValue]);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localImages.findIndex((img) => img.url === active.id);
    const newIndex = localImages.findIndex((img) => img.url === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newImages = arrayMove(localImages, oldIndex, newIndex);
    setLocalImages(newImages);
    onReorder(newImages);
  }

  return (
    <div className="flex flex-col gap-3">
      {localImages.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localImages.map((img) => img.url)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {localImages.map((image) => (
                <SortableImageItem
                  key={image.url}
                  image={image}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          Aucune image
        </p>
      )}
      <div className="border-t pt-3">
        <p className="text-xs text-muted-foreground mb-2">Ajouter une image</p>
        <UploadFile accept="image/*" onUploadComplete={onUploadComplete} />
      </div>
    </div>
  );
}

function ImageNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const openWindow = useWindowsStore((s) => s.openWindow);

  const currentValue = (values?.images as Value | undefined) ?? defaultValue;
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentValue.length > 0 && currentIndex >= currentValue.length) {
      setCurrentIndex(currentValue.length - 1);
    }
  }, [currentValue.length, currentIndex]);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "image" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const handleUploadComplete = useCallback(
    (fileData: {
      url: string;
      filename: string;
      mimeType: string;
      size: number;
      uploadedAt: number;
      key: string;
    }) => {
      if (!nodeDataId) return;
      updateNodeDataValues({
        nodeDataId,
        values: {
          images: [
            ...currentValue,
            {
              url: fileData.url,
              filename: fileData.filename,
              mimeType: fileData.mimeType,
              size: fileData.size,
              uploadedAt: fileData.uploadedAt,
              key: fileData.key,
            },
          ],
        },
      });
    },
    [nodeDataId, currentValue, updateNodeDataValues],
  );

  const handleDelete = useCallback(
    (url: string) => {
      if (!nodeDataId) return;
      const newImages = currentValue.filter((img) => img.url !== url);
      updateNodeDataValues({ nodeDataId, values: { images: newImages } });
    },
    [nodeDataId, currentValue, updateNodeDataValues],
  );

  const handleReorder = useCallback(
    (newImages: Value) => {
      if (!nodeDataId) return;
      updateNodeDataValues({ nodeDataId, values: { images: newImages } });
    },
    [nodeDataId, updateNodeDataValues],
  );

  const hasMultiple = currentValue.length > 1;
  const safeIndex =
    currentValue.length === 0
      ? 0
      : Math.min(Math.max(currentIndex, 0), currentValue.length - 1);

  const handleDownload = useCallback(async () => {
    const image = currentValue[safeIndex];
    if (!image) return;
    const filename = image.filename ?? `image-${safeIndex + 1}`;
    try {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Download via fetch failed, falling back to anchor", err);
      const link = document.createElement("a");
      link.href = image.url;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    }
  }, [currentValue, safeIndex]);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Button
          size="icon"
          variant="outline"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </Button>
        {currentValue.length > 0 && (
          <Button
            variant="outline"
            size="icon"
            title="Télécharger"
            onClick={handleDownload}
          >
            <TbDownload />
          </Button>
        )}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" title="Gérer les images">
              <TbPencil />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gérer les images</DialogTitle>
            </DialogHeader>
            {nodeDataId && (
              <ImageEditDialog
                nodeDataId={nodeDataId}
                currentValue={currentValue}
                onUploadComplete={handleUploadComplete}
                onDelete={handleDelete}
                onReorder={handleReorder}
              />
            )}
          </DialogContent>
        </Dialog>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        {currentValue.length === 0 ? (
          <div className="h-full w-full flex flex-col gap-2 items-center justify-center">
            <TbPhoto size={24} />
            No image
          </div>
        ) : hasMultiple ? (
          <div className="group/carousel relative h-full w-full">
            <img
              src={currentValue[safeIndex].url}
              alt="Node Image"
              className="w-full h-full object-contain rounded-[4px]"
            />
            {safeIndex > 0 && (
              <button
                className="nodrag absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/carousel:opacity-100 transition-opacity bg-black/50 text-white rounded-full p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((i) => i - 1);
                }}
              >
                <TbChevronLeft size={14} />
              </button>
            )}
            {safeIndex < currentValue.length - 1 && (
              <button
                className="nodrag absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/carousel:opacity-100 transition-opacity bg-black/50 text-white rounded-full p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((i) => i + 1);
                }}
              >
                <TbChevronRight size={14} />
              </button>
            )}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
              {currentValue.map((_, i) => (
                <button
                  key={i}
                  className={cn(
                    "nodrag pointer-events-auto w-1.5 h-1.5 rounded-full transition-colors",
                    i === safeIndex ? "bg-white" : "bg-white/40",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(i);
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <img
            src={currentValue[0].url}
            alt="Node Image"
            className="w-full h-full object-contain rounded-[4px]"
          />
        )}
      </NodeFrame>
    </>
  );
}

export default memo(ImageNode, areNodePropsEqual);
