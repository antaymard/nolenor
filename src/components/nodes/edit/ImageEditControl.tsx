import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { TbArrowFork, TbGripVertical, TbPencil, TbTrash } from "react-icons/tb";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs";
import { UploadFile } from "@/components/fields/UploadFile";
import ImageGenerateTab from "../prebuilt-nodes/image/ImageGenerateTab";
import { useNodeData, useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useSplitImageNode } from "@/hooks/useSplitImageNode";
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
import { WindowEditTrigger } from "./WindowEditTrigger";
import type { NodeEditTriggerVariant } from "./WindowEditTrigger";

export type ImageEditItem = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: number;
  key?: string;
};

type Value = ImageEditItem[];

const defaultValue: Value = [];

/**
 * Le nom du node, en tête du dialog. Vide = le titre retombe sur le filename
 * de la première image (cf. `getNodeDataTitle`), que le placeholder montre.
 *
 * Écrit au blur et sur Enter, pas à la frappe : chaque écriture de `values`
 * pose un point de restauration et recale le titre des chunks de recherche.
 * `DialogContent` démonte à la fermeture, donc l'état local repart de la
 * valeur stockée à chaque ouverture.
 */
function ImageTitleField({
  nodeDataId,
  storedTitle,
  fallbackTitle,
}: {
  nodeDataId: Id<"nodeDatas">;
  storedTitle: string;
  fallbackTitle: string;
}) {
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const [draft, setDraft] = useState(storedTitle);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next === storedTitle.trim()) return;
    updateNodeDataValues({ nodeDataId, values: { title: next } });
  }, [draft, storedTitle, nodeDataId, updateNodeDataValues]);

  // Fermer le dialog (Échap, clic dehors) démonte le champ sans `blur` : la
  // saisie en cours est validée au démontage, via la dernière version de
  // `commit`.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  return (
    <Input
      aria-label="Title"
      placeholder={fallbackTitle}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function SortableImageItem({
  image,
  onDelete,
  onExtract,
  isWorking,
}: {
  image: ImageEditItem;
  onDelete: (url: string) => void;
  onExtract?: (url: string) => void;
  isWorking?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.url });

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
      {onExtract && (
        <Button
          variant="ghost"
          size="icon"
          title="Extract to a new node"
          disabled={isWorking}
          className="flex-shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onExtract(image.url)}
        >
          <TbArrowFork size={14} />
        </Button>
      )}
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
  currentValue,
  onUploadComplete,
  onUploadsComplete,
  onDelete,
  onReorder,
  onExtract,
  onSplitAll,
  isWorking,
}: {
  currentValue: Value;
  onUploadComplete: (fileData: {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: number;
    key: string;
  }) => void;
  onUploadsComplete: (
    filesData: Array<{
      url: string;
      filename: string;
      mimeType: string;
      size: number;
      uploadedAt: number;
      key: string;
    }>,
  ) => void;
  onDelete: (url: string) => void;
  onReorder: (newImages: Value) => void;
  onExtract?: (url: string) => void;
  onSplitAll?: () => void;
  isWorking?: boolean;
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
                  onExtract={onExtract}
                  isWorking={isWorking}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          No image
        </p>
      )}
      <div className="border-t pt-3">
        {onSplitAll && localImages.length >= 2 && (
          <Button
            variant="outline"
            size="sm"
            disabled={isWorking}
            className="w-full mb-2"
            onClick={onSplitAll}
          >
            <TbArrowFork size={14} />
            Split all ({localImages.length})
          </Button>
        )}
        <p className="text-xs text-muted-foreground mb-2">Add images</p>
        <UploadFile
          accept="image/*"
          multiple
          onUploadComplete={onUploadComplete}
          onUploadsComplete={onUploadsComplete}
        />
      </div>
    </div>
  );
}

interface ImageEditControlProps {
  nodeDataId: Id<"nodeDatas"> | undefined;
  /** Id React Flow : les edges — donc les nodes d'entrée — s'indexent dessus. */
  xyNodeId: string;
  variant?: NodeEditTriggerVariant;
}

/**
 * Bouton Edit + dialog de gestion des images (onglets Library complet et
 * Generate), partagé entre la toolbar du node canvas et le header des windows
 * (flottante et plein écran). Le contenu du dialog vit ici une seule fois
 * (DRY).
 */
export function ImageEditControl({
  nodeDataId,
  xyNodeId,
  variant = "toolbar",
}: ImageEditControlProps) {
  const values = useNodeDataValues(nodeDataId);
  // Le statut de génération est un champ top-level du document, pas une value :
  // il faut donc le nodeData complet, pas seulement ses values.
  const nodeData = useNodeData(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { extractImage, splitAll, isSplitting } = useSplitImageNode();

  const currentValue =
    (values?.images as Value | undefined) ?? defaultValue;
  const [dialogOpen, setDialogOpen] = useState(false);

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

  // Un seul update pour tout le lot : N mutations `[...current, +1]` en
  // parallèle s'écraseraient (le client remplace tout le tableau), et chaque
  // mutation ouvre un snapshot de version.
  const handleUploadsComplete = useCallback(
    (
      filesData: Array<{
        url: string;
        filename: string;
        mimeType: string;
        size: number;
        uploadedAt: number;
        key: string;
      }>,
    ) => {
      if (!nodeDataId || filesData.length === 0) return;
      updateNodeDataValues({
        nodeDataId,
        values: {
          images: [
            ...currentValue,
            ...filesData.map((fileData) => ({
              url: fileData.url,
              filename: fileData.filename,
              mimeType: fileData.mimeType,
              size: fileData.size,
              uploadedAt: fileData.uploadedAt,
              key: fileData.key,
            })),
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

  const handleExtract = useCallback(
    (url: string) => {
      if (!nodeDataId) return;
      const image = currentValue.find((img) => img.url === url);
      if (!image) return;
      void extractImage({
        xyNodeId,
        nodeDataId,
        image,
        remainingImages: currentValue.filter((img) => img.url !== url),
      });
    },
    [nodeDataId, currentValue, extractImage, xyNodeId],
  );

  const handleSplitAll = useCallback(() => {
    if (!nodeDataId) return;
    void splitAll({ xyNodeId, nodeDataId, images: currentValue });
  }, [nodeDataId, currentValue, splitAll, xyNodeId]);

  // Absent en base = `true` : l'inclusion des entrées est le défaut, seul
  // `false` la bloque. Pas de `useMemo` : un booléen n'a pas d'identité à
  // stabiliser pour l'effet de synchronisation de l'onglet Generate.
  const storedIncludeReferences =
    (values as Record<string, unknown> | undefined)?.imageIncludeReferences !==
    false;

  const storedPrompt =
    typeof values?.imagePrompt === "string" ? values.imagePrompt : "";
  // Si un prompt existe, l'édition reprend sur l'onglet Generate plutôt que
  // Library. `DialogContent` (Radix) démonte à la fermeture, donc ce
  // `defaultValue` est réévalué à chaque ouverture.
  const hasPrompt = storedPrompt.trim().length > 0;
  const storedTitle = typeof values?.title === "string" ? values.title : "";

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {variant === "toolbar" ? (
          <NodeToolbarButton label="Edit" title="Manage images">
            <TbPencil />
          </NodeToolbarButton>
        ) : (
          <WindowEditTrigger title="Manage images" />
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage images</DialogTitle>
        </DialogHeader>
        {nodeDataId && (
          <ImageTitleField
            nodeDataId={nodeDataId}
            storedTitle={storedTitle}
            fallbackTitle={currentValue[0]?.filename ?? "Image"}
          />
        )}
        {nodeDataId && (
          <Tabs defaultValue={hasPrompt ? "generate" : "library"}>
            <TabsList className="w-full">
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="generate">Generate</TabsTrigger>
            </TabsList>
            <TabsContent value="library" className="pt-1">
              <ImageEditDialog
                currentValue={currentValue}
                onUploadComplete={handleUploadComplete}
                onUploadsComplete={handleUploadsComplete}
                onDelete={handleDelete}
                onReorder={handleReorder}
                onExtract={
                  currentValue.length >= 2 ? handleExtract : undefined
                }
                onSplitAll={
                  currentValue.length >= 2 ? handleSplitAll : undefined
                }
                isWorking={isSplitting}
              />
            </TabsContent>
            <TabsContent value="generate" className="pt-1">
              <ImageGenerateTab
                nodeDataId={nodeDataId}
                xyNodeId={xyNodeId}
                storedPrompt={storedPrompt}
                storedIncludeReferences={storedIncludeReferences}
                generation={nodeData?.imageGeneration}
                onGenerated={() => setDialogOpen(false)}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const MemoImageEditControl = memo(ImageEditControl);
