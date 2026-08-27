import { memo, useCallback, useEffect, useState } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import { useNodeData, useNodeDataValues } from "@/hooks/useNodeData";
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
import { Spinner } from "@/components/shadcn/spinner";
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
import ImageGenerateTab from "./image/ImageGenerateTab";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useDownloadFile } from "@/hooks/useDownloadFile";
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
import type { XyNodeProps } from "@/types/domain";

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
  onDelete,
  onReorder,
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
          No image
        </p>
      )}
      <div className="border-t pt-3">
        <p className="text-xs text-muted-foreground mb-2">Add an image</p>
        <UploadFile accept="image/*" onUploadComplete={onUploadComplete} />
      </div>
    </div>
  );
}

/**
 * Découpe `weights` en `rowCount` lignes contiguës de poids aussi proches que
 * possible. Les images gardent leur ordre : on ne réordonne pas une galerie.
 */
function splitEvenly(weights: number[], rowCount: number): number[][] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const rows: number[][] = [];
  let row: number[] = [];
  let rowWeight = 0;
  let placed = 0;

  for (let i = 0; i < weights.length; i++) {
    const rowsLeft = rowCount - rows.length;
    const itemsLeft = weights.length - i;
    const target = (total - placed) / rowsLeft;
    // Fermer la ligne quand l'image de trop l'éloignerait de la cible, ou
    // qu'il ne reste plus assez d'images pour en poser une par ligne restante.
    const closeRow =
      row.length > 0 &&
      rowsLeft > 1 &&
      (itemsLeft < rowsLeft ||
        Math.abs(rowWeight + weights[i] - target) > Math.abs(rowWeight - target));

    if (closeRow) {
      rows.push(row);
      placed += rowWeight;
      row = [];
      rowWeight = 0;
    }

    row.push(i);
    rowWeight += weights[i];
  }

  rows.push(row);
  return rows;
}

/**
 * Range les images en lignes, façon galerie justifiée.
 *
 * Dans une ligne, chaque image occupe une largeur proportionnelle à son ratio
 * — un portrait prend moins de place qu'un paysage, personne n'est recadré
 * pour rentrer dans une case carrée. Une ligne de ratios r₁…rₙ posée sur toute
 * la largeur est alors haute de 1/Σr (largeur prise pour 1), ce qui donne la
 * hauteur naturelle d'un empilement. On essaie chaque nombre de lignes et on
 * garde celui dont la hauteur naturelle colle le mieux à celle du node : le
 * reste de l'écart est absorbé par un `object-cover` identique partout, donc
 * un rognage minime au lieu d'un cadrage imposé.
 */
function packRows(weights: number[], boxAspect: number): number[][] {
  let best: number[][] = [weights.map((_, i) => i)];
  let bestScore = Infinity;

  for (let rowCount = 1; rowCount <= weights.length; rowCount++) {
    const rows = splitEvenly(weights, rowCount);
    const height = rows.reduce(
      (sum, row) => sum + 1 / row.reduce((acc, i) => acc + weights[i], 0),
      0,
    );
    // La boîte est haute de 1/boxAspect pour une largeur de 1.
    const score = Math.abs(Math.log(height * boxAspect));

    if (score < bestScore) {
      bestScore = score;
      best = rows;
    }
  }

  return best;
}

/**
 * Répartit `count` facteurs `flex-grow` de somme confortablement supérieure à
 * 1 : sous 1, la spec ne distribue que cette fraction de l'espace libre, et la
 * mosaïque ne remplirait pas le node.
 */
function growFactors(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => (value / total) * values.length);
}

/**
 * Variant "grid" : toutes les images d'un coup, en mosaïque justifiée.
 *
 * Le découpage suit à la fois les ratios des images et celui du node : un node
 * en bandeau tient sur une ligne, un node en colonne empile. Les lignes se
 * partagent la hauteur au prorata de leur hauteur naturelle et les images
 * d'une ligne se partagent la largeur au prorata de leur ratio, le tout en
 * `flex-grow` — donc pas de trou, pas de débordement, et un redimensionnement
 * du node se répercute sans un pixel calculé en JS.
 *
 * Les ratios sont mesurés à l'`onLoad` de chaque image : ils ne sont pas dans
 * les données du node, et une image arrivée par l'agent n'en portera jamais.
 * Tant qu'une image n'a pas chargé, elle compte pour un carré.
 *
 * Aucune tuile n'est en `nodrag` : elles couvrent tout le node, les marquer
 * ainsi rendrait celui-ci indéplaçable à la souris. Un clic sans déplacement
 * passe quand même — c'est lui qui désigne l'image sur laquelle agit la
 * toolbar.
 */
function ImageGrid({
  images,
  aspect,
  selectedIndex,
  showSelection,
  onSelect,
}: {
  images: Value;
  aspect: number;
  selectedIndex: number;
  showSelection: boolean;
  onSelect: (index: number) => void;
}) {
  const [ratios, setRatios] = useState<Record<string, number>>({});

  const handleLoad = useCallback(
    (url: string, event: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (!naturalWidth || !naturalHeight) return;
      setRatios((previous) =>
        previous[url] !== undefined
          ? previous
          : { ...previous, [url]: naturalWidth / naturalHeight },
      );
    },
    [],
  );

  const weights = images.map((image) => ratios[image.url] ?? 1);
  const rows = packRows(weights, aspect);
  const rowGrows = growFactors(
    rows.map((row) => 1 / row.reduce((sum, i) => sum + weights[i], 0)),
  );

  return (
    <div className="@container h-full w-full overflow-hidden rounded-[4px]">
      <div
        className={cn(
          "flex h-full w-full flex-col gap-[var(--tile-gap)]",
          "[--tile-gap:1px] @min-[220px]:[--tile-gap:2px] @min-[420px]:[--tile-gap:3px]",
        )}
      >
        {rows.map((row, rowIndex) => {
          const tileGrows = growFactors(row.map((i) => weights[i]));

          return (
            <div
              key={rowIndex}
              className="flex min-h-0 gap-[var(--tile-gap)]"
              style={{ flex: `${rowGrows[rowIndex]} 1 0%` }}
            >
              {row.map((i, positionInRow) => (
                <div
                  key={`${images[i].url}-${i}`}
                  className="relative min-w-0 overflow-hidden"
                  style={{ flex: `${tileGrows[positionInRow]} 1 0%` }}
                  title={images[i].filename}
                  onClick={() => onSelect(i)}
                >
                  {/* En absolu : une image dans le flux imposerait sa hauteur
                      propre à la ligne, qui ne suivrait plus son flex-grow. */}
                  <img
                    src={images[i].url}
                    alt={images[i].filename ?? `Image ${i + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    onLoad={(event) => handleLoad(images[i].url, event)}
                  />
                  {/* En calque et non en `ring` sur la tuile : une ombre interne
                      se peint sous l'image, qui couvre toute la tuile. */}
                  {showSelection && i === selectedIndex && (
                    <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-blue-500/80" />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImageNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const isGrid = xyNode.data.variant === "grid";
  // Ratio du node, relu à chaque redimensionnement : React Flow republie
  // width/height pendant le drag des poignées, donc la mosaïque se recompose
  // en direct.
  const aspect =
    xyNode.width && xyNode.height ? xyNode.width / xyNode.height : 1;
  const values = useNodeDataValues(nodeDataId);
  // Le statut de génération est un champ top-level du document, pas une value :
  // il faut donc le nodeData complet, pas seulement ses values.
  const nodeData = useNodeData(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { downloadStoredFile } = useDownloadFile();
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

  const isGenerating = nodeData?.imageGeneration?.status === "running";

  const hasMultiple = currentValue.length > 1;
  const safeIndex =
    currentValue.length === 0
      ? 0
      : Math.min(Math.max(currentIndex, 0), currentValue.length - 1);

  const handleDownload = useCallback(() => {
    const image = currentValue[safeIndex];
    if (!image) return;
    // Les images fournies par l'agent n'ont pas de clé : le hook retombe alors
    // sur le rapatriement de l'URL publique.
    void downloadStoredFile({
      key: image.key,
      url: image.url,
      filename: image.filename ?? `image-${safeIndex + 1}`,
    });
  }, [currentValue, downloadStoredFile, safeIndex]);

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
            title="Download"
            onClick={handleDownload}
          >
            <TbDownload />
          </Button>
        )}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" title="Manage images">
              <TbPencil />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage images</DialogTitle>
            </DialogHeader>
            {nodeDataId && (
              <Tabs defaultValue="library">
                <TabsList className="w-full">
                  <TabsTrigger value="library">Library</TabsTrigger>
                  <TabsTrigger value="generate">Generate</TabsTrigger>
                </TabsList>
                <TabsContent value="library" className="pt-1">
                  <ImageEditDialog
                    currentValue={currentValue}
                    onUploadComplete={handleUploadComplete}
                    onDelete={handleDelete}
                    onReorder={handleReorder}
                  />
                </TabsContent>
                <TabsContent value="generate" className="pt-1">
                  <ImageGenerateTab
                    nodeDataId={nodeDataId}
                    storedPrompt={
                      typeof values?.imagePrompt === "string"
                        ? values.imagePrompt
                        : ""
                    }
                    generation={nodeData?.imageGeneration}
                  />
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        {isGenerating && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[4px] bg-background/70 backdrop-blur-[1px]">
            <Spinner className="size-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Generating…</span>
          </div>
        )}
        {currentValue.length === 0 ? (
          <div className="h-full w-full flex flex-col gap-2 items-center justify-center">
            <TbPhoto size={24} />
            No image
          </div>
        ) : isGrid ? (
          <ImageGrid
            images={currentValue}
            aspect={aspect}
            selectedIndex={safeIndex}
            // L'anneau ne sert qu'à désigner la cible du bouton Download :
            // inutile de le montrer quand la toolbar n'est pas là.
            showSelection={Boolean(xyNode.selected) && hasMultiple}
            onSelect={setCurrentIndex}
          />
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
