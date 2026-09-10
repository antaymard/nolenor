import { useEffect, useMemo, useState } from "react";
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
import {
  useInputImageNodes,
  type InputImageNode,
} from "@/hooks/useInputImageNodes";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import ImageReferencePicker from "./ImageReferencePicker";

type ImageGenerationStatus = Doc<"nodeDatas">["imageGeneration"];

export default function ImageGenerateTab({
  nodeDataId,
  xyNodeId,
  storedPrompt,
  storedReferences,
  generation,
  onGenerated,
}: {
  nodeDataId: Id<"nodeDatas">;
  /** Id React Flow : les edges — donc les nodes d'entrée — s'indexent dessus. */
  xyNodeId: string;
  storedPrompt: string;
  storedReferences: Id<"nodeDatas">[];
  generation: ImageGenerationStatus;
  onGenerated?: () => void;
}) {
  const modelOptions = useQuery(api.ia.imageGeneration.listImageModels, {});
  const generateImages = useMutation(api.ia.imageGeneration.generateImages);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const inputNodes = useInputImageNodes(xyNodeId);

  const [prompt, setPrompt] = useState(storedPrompt);
  const [model, setModel] = useState<ImageModelValues | undefined>(undefined);
  const [count, setCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(storedReferences);

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
    setSelectedIds(storedReferences);
  }, [storedReferences]);

  // Une référence enregistrée peut avoir cessé d'être légale depuis : node
  // débranché, supprimé, ou vidé de ses images. On ne l'envoie pas — le serveur
  // la refuserait, et l'utilisateur ne comprendrait pas l'erreur puisque la
  // vignette correspondante n'est plus affichée.
  const attachedNodes = useMemo(() => {
    const byId = new Map(inputNodes.map((node) => [node.nodeDataId, node]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((node): node is InputImageNode => node !== undefined);
  }, [inputNodes, selectedIds]);

  const attachableIds = useMemo(
    () => attachedNodes.map((node) => node.nodeDataId),
    [attachedNodes],
  );

  // `modelOptions` est `undefined` tant que la query n'a pas répondu ; le
  // catalogue lui-même n'est jamais vide (il est constant côté serveur).
  const selectedModel = useMemo(() => {
    if (!modelOptions) return undefined;
    return (
      modelOptions.find((option) => option.value === model) ?? modelOptions[0]
    );
  }, [modelOptions, model]);

  const isRunning = generation?.status === "running";
  const isBusy = isRunning || isSubmitting || isClearing;
  const maxImages = selectedModel?.maxImages ?? 1;
  const maxReferenceImages = selectedModel?.maxReferenceImages ?? 0;

  // Compté en images et non en nodes : un seul node multi-image peut dépasser
  // le plafond à lui tout seul, comme côté serveur. Pas de `useMemo` — un
  // nombre n'a pas d'identité à stabiliser, et la somme porte sur ≤ 16 entrées.
  const attachedImageCount = attachedNodes.reduce(
    (total, node) => total + node.imageUrls.length,
    0,
  );

  // Changer pour un modèle au plafond plus bas laisse une sélection devenue
  // impossible. Contrairement à `count` juste en dessous, on ne la tronque PAS :
  // retirer des références en silence changerait le sens d'un prompt qui les
  // décrit. On bloque, et l'utilisateur arbitre — modèle ou références.
  const referenceLimitExceeded = attachedImageCount > maxReferenceImages;

  function handleToggleReference(nodeDataId: Id<"nodeDatas">) {
    setSelectedIds((current) =>
      current.includes(nodeDataId)
        ? current.filter((id) => id !== nodeDataId)
        : // Ajout en fin : l'ordre de sélection est celui des références
          // envoyées, et donc celui que les numéros affichent.
          [...current, nodeDataId],
    );
  }

  // Changer pour un modèle qui plafonne plus bas ne doit pas laisser une
  // demande impossible dans le formulaire.
  const safeCount = Math.min(count, maxImages);

  // Vide le prompt ET les références, en local comme en base : sans ça un
  // champ effacé à la main serait perdu à la fermeture (seul `generateImages`
  // persistait, et il refuse le vide). En cas d'échec on restaure le local
  // depuis le serveur — le hook ne revert que le store, pas cet état.
  async function handleClear() {
    setPrompt("");
    setSelectedIds([]);
    setIsClearing(true);
    try {
      const ok = await updateNodeDataValues({
        nodeDataId,
        values: { imagePrompt: "", imageReferences: [] },
      });
      if (!ok) {
        setPrompt(storedPrompt);
        setSelectedIds(storedReferences);
      }
    } finally {
      setIsClearing(false);
    }
  }

  const hasClearableContent =
    prompt.trim().length > 0 || selectedIds.length > 0;

  async function handleGenerate() {
    if (!selectedModel || prompt.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await generateImages({
        nodeDataId,
        prompt,
        count: safeCount,
        model: selectedModel.value,
        referenceNodeDataIds: attachableIds,
      });
      onGenerated?.();
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
        selectedNodeDataIds={attachableIds}
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

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
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
        <Button
          size="sm"
          variant="outline"
          onClick={handleClear}
          disabled={isBusy || !hasClearableContent}
          title="Clear the prompt and remove attached references"
        >
          {isClearing ? <Spinner /> : "Clear"}
        </Button>
      </div>

      {referenceLimitExceeded && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <TbAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">
            {attachedImageCount} reference images for a model that takes{" "}
            {maxReferenceImages}. Remove some, or pick another model.
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
