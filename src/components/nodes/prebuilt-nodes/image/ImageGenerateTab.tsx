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

type ImageGenerationStatus = Doc<"nodeDatas">["imageGeneration"];

export default function ImageGenerateTab({
  nodeDataId,
  storedPrompt,
  generation,
}: {
  nodeDataId: Id<"nodeDatas">;
  storedPrompt: string;
  generation: ImageGenerationStatus;
}) {
  const modelOptions = useQuery(api.ia.imageGeneration.listImageModels, {});
  const generateImages = useMutation(api.ia.imageGeneration.generateImages);

  const [prompt, setPrompt] = useState(storedPrompt);
  const [model, setModel] = useState<ImageModelValues | undefined>(undefined);
  const [count, setCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Le prompt vit en base : quand il change côté serveur (autre onglet, ou Nolë
  // qui le réécrit), le champ suit — sauf si l'utilisateur est en train de le
  // modifier, auquel cas `storedPrompt` n'a pas bougé et l'effet ne fait rien.
  useEffect(() => {
    setPrompt(storedPrompt);
  }, [storedPrompt]);

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
      });
    } catch (error) {
      toastError(error, "La génération n'a pas pu démarrer");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={isBusy}
        rows={4}
        placeholder="Décrivez l'image à générer…"
        className="text-sm"
      />

      <div className="flex items-center gap-2">
        <Select
          value={selectedModel?.value}
          onValueChange={(value) => setModel(value as ImageModelValues)}
          disabled={isBusy || !selectedModel}
        >
          <SelectTrigger size="sm" className="flex-1 min-w-0">
            <SelectValue placeholder="Modèle" />
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
        disabled={isBusy || prompt.trim().length === 0 || !selectedModel}
      >
        {isRunning ? (
          <>
            <Spinner /> Génération en cours…
          </>
        ) : (
          <>
            <TbSparkles /> Générer
          </>
        )}
      </Button>

      {isRunning && (
        <p className="text-xs text-muted-foreground text-center">
          Vous pouvez fermer cette fenêtre : les images arriveront sur le node.
        </p>
      )}

      {generation?.status === "error" && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <TbAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">
            {generation.error ?? "La génération a échoué."}
          </span>
        </p>
      )}
    </div>
  );
}
