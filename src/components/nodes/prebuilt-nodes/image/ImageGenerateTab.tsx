import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import type { ImageModelValues } from "@/types/convex";
import { Button } from "@/components/shadcn/button";
import { Textarea } from "@/components/shadcn/textarea";
import { Spinner } from "@/components/shadcn/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { toastError } from "@/components/utils/errorUtils";
import { TbAlertTriangle, TbSparkles } from "react-icons/tb";
import { useInputImageNodes } from "@/hooks/useInputImageNodes";
import ImageReferencePicker from "./ImageReferencePicker";

type ImageGenerationStatus = Doc<"nodeDatas">["imageGeneration"];

export default function ImageGenerateTab({
  nodeDataId,
  xyNodeId,
  storedPrompt,
  storedReferences,
  generation,
}: {
  nodeDataId: Id<"nodeDatas">;
  /** Id React Flow : les edges — donc les nodes d'entrée — s'indexent dessus. */
  xyNodeId: string;
  storedPrompt: string;
  storedReferences: string[];
  generation: ImageGenerationStatus;
}) {
  const modelOptions = useQuery(api.ia.imageGeneration.listImageModels, {});
  const generateImages = useMutation(api.ia.imageGeneration.generateImages);
  const inputNodes = useInputImageNodes(xyNodeId);

  const [prompt, setPrompt] = useState(storedPrompt);
  const [model, setModel] = useState<ImageModelValues | undefined>(undefined);
  const [count, setCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState(storedReferences);

  // Le prompt vit en base : quand il change côté serveur (autre onglet, ou Nolë
  // qui le réécrit), le champ suit — sauf si l'utilisateur est en train de le
  // modifier, auquel cas `storedPrompt` n'a pas bougé et l'effet ne fait rien.
  useEffect(() => {
    setPrompt(storedPrompt);
  }, [storedPrompt]);

  // Même contrat que le prompt : la sélection vit en base, donc rouvrir le node
  // la retrouve. `storedReferences` ne change que quand le serveur l'écrit, donc
  // cet effet ne piétine pas une sélection en cours.
  useEffect(() => {
    setSelectedNodeIds(storedReferences);
  }, [storedReferences]);

  // Une référence enregistrée peut avoir cessé d'être légale depuis : node
  // débranché, supprimé, ou vidé de ses images. On ne l'envoie pas — le serveur
  // la refuserait, et l'utilisateur ne comprendrait pas l'erreur puisque la
  // vignette correspondante n'est plus affichée.
  const attachableNodeIds = useMemo(() => {
    const available = new Set(inputNodes.map((node) => node.nodeId));
    return selectedNodeIds.filter((nodeId) => available.has(nodeId));
  }, [inputNodes, selectedNodeIds]);

  // `modelOptions` est `undefined` tant que la query n'a pas répondu ; le
  // catalogue lui-même n'est jamais vide (il est constant côté serveur).
  const selectedModel = useMemo(() => {
    if (!modelOptions) return undefined;
    return (
      modelOptions.find((option) => option.value === model) ?? modelOptions[0]
    );
  }, [modelOptions, model]);

  const isRunning = generation?.status === "running";
  const isBusy = isRunning || isSubmitting;
  const maxImages = selectedModel?.maxImages ?? 1;
  const maxReferenceImages = selectedModel?.maxReferenceImages ?? 0;

  // Compté en images et non en nodes : un seul node multi-image peut dépasser
  // le plafond à lui tout seul, comme côté serveur.
  const attachedImageCount = useMemo(() => {
    const imagesByNodeId = new Map(
      inputNodes.map((node) => [node.nodeId, node.images.length]),
    );
    return attachableNodeIds.reduce(
      (total, nodeId) => total + (imagesByNodeId.get(nodeId) ?? 0),
      0,
    );
  }, [inputNodes, attachableNodeIds]);

  // Changer pour un modèle au plafond plus bas laisse une sélection devenue
  // impossible. Contrairement à `count` juste en dessous, on ne la tronque PAS :
  // retirer des références en silence changerait le sens d'un prompt qui les
  // décrit. On bloque, et l'utilisateur arbitre — modèle ou références.
  const referenceLimitExceeded = attachedImageCount > maxReferenceImages;

  const handleToggleReference = useCallback((nodeId: string) => {
    setSelectedNodeIds((current) =>
      current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : // Ajout en fin : l'ordre de sélection est celui des références
          // envoyées, et donc celui que les numéros affichent.
          [...current, nodeId],
    );
  }, []);

  // Changer pour un modèle qui plafonne plus bas ne doit pas laisser une
  // demande impossible dans le formulaire.
  const safeCount = Math.min(count, maxImages);

  async function handleGenerate() {
    if (!selectedModel || prompt.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await generateImages({
        nodeDataId,
        prompt,
        count: safeCount,
        model: selectedModel.value,
        referenceNodeIds: attachableNodeIds,
      });
    } catch (error) {
      toastError(error, "Could not start the generation");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ImageReferencePicker
        inputNodes={inputNodes}
        selectedNodeIds={attachableNodeIds}
        attachedImageCount={attachedImageCount}
        onToggle={handleToggleReference}
        maxReferenceImages={maxReferenceImages}
        disabled={isBusy}
      />

      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={isBusy}
        rows={4}
        placeholder="Describe the image to generate…"
        className="text-sm"
      />

      <div className="flex items-center gap-2">
        <Select
          value={selectedModel?.value}
          onValueChange={(value) => setModel(value as ImageModelValues)}
          disabled={isBusy || !selectedModel}
        >
          <SelectTrigger size="sm" className="flex-1 min-w-0">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {(modelOptions ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center justify-between gap-3 w-full">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ${option.pricePerImage}/img
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(safeCount)}
          onValueChange={(value) => setCount(Number(value))}
          disabled={isBusy}
        >
          <SelectTrigger size="sm" className="w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: maxImages }, (_, index) => index + 1).map(
              (value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        onClick={handleGenerate}
        disabled={
          isBusy ||
          prompt.trim().length === 0 ||
          !selectedModel ||
          referenceLimitExceeded
        }
      >
        {isRunning ? (
          <>
            <Spinner /> Generating…
          </>
        ) : (
          <>
            <TbSparkles />{" "}
            {safeCount > 1 ? `Generate ${safeCount} images` : "Generate"}
          </>
        )}
      </Button>

      {referenceLimitExceeded && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <TbAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">
            {maxReferenceImages === 0
              ? `${selectedModel?.label ?? "This model"} does not accept reference images. Pick another model, or remove them.`
              : `${attachedImageCount} reference images for a model that takes ${maxReferenceImages}. Remove some, or pick another model.`}
          </span>
        </p>
      )}

      {isRunning && (
        <p className="text-xs text-muted-foreground text-center">
          You can close this window — the images will land on the node.
        </p>
      )}

      {generation?.status === "error" && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <TbAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">
            {generation.error ?? "The generation failed."}
          </span>
        </p>
      )}
    </div>
  );
}
