import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ConvexError } from "convex/values";
import { Button } from "@/components/shadcn/button";
import { Textarea } from "@/components/shadcn/textarea";
import { toastError } from "@/components/utils/errorUtils";
import { cn } from "@/lib/utils";
import {
  entriesToText,
  parseEntries,
  textToEntries,
} from "./memoryTextUtils";

type MemoryEditorCardProps = {
  // Clé de la source éditée ("user" ou un canvasId) : quand elle change, le
  // contenu est réhydraté depuis `rawContent` sans perdre le focus ailleurs.
  storageKey: string;
  title: string;
  description: string;
  maxChars: number;
  // `undefined` = chargement, `null` = aucune memory, string = JSON stocké.
  rawContent: string | null | undefined;
  onSave: (entries: string[]) => Promise<void>;
};

function extractMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string"
      ? error.data
      : JSON.stringify(error.data);
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function MemoryEditorCard({
  storageKey,
  title,
  description,
  maxChars,
  rawContent,
  onSave,
}: MemoryEditorCardProps) {
  const [text, setText] = useState("");
  const [hydratedText, setHydratedText] = useState("");
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (rawContent !== undefined && hydratedFor !== storageKey) {
      const initial = entriesToText(parseEntries(rawContent));
      setText(initial);
      setHydratedText(initial);
      setHydratedFor(storageKey);
      setSaveError(null);
    }
  }, [rawContent, storageKey, hydratedFor]);

  const entries = useMemo(() => textToEntries(text), [text]);
  // Même métrique que la limite IA : le JSON sérialisé, overhead inclus.
  const serializedLen = JSON.stringify(entries).length;
  const percentage = Math.round((serializedLen / maxChars) * 100);
  const isOverLimit = serializedLen > maxChars;
  const isNearLimit = !isOverLimit && percentage >= 80;
  const isLoading = rawContent === undefined;
  const isDirty = text !== hydratedText;

  const handleSave = async () => {
    if (isOverLimit) {
      const message = `Memory at ${serializedLen}/${maxChars} chars: exceeds the limit by ${serializedLen - maxChars} chars. Remove or shorten entries before saving.`;
      setSaveError(message);
      toast.error(message);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(entries);
      setHydratedText(text);
      setSaveError(null);
      toast.success(`${title} saved.`);
    } catch (error) {
      setSaveError(extractMessage(error, `Failed to save ${title}.`));
      toastError(error, `Failed to save ${title}.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        <span
          className={cn(
            "text-xs tabular-nums",
            isOverLimit
              ? "font-semibold text-red-600"
              : isNearLimit
                ? "font-medium text-amber-600"
                : "text-gray-500",
          )}
        >
          {percentage}% — {serializedLen}/{maxChars} chars
        </span>
      </div>
      <p className="text-sm text-gray-500">{description}</p>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={isLoading || isSaving}
        placeholder={isLoading ? "Loading…" : "One memory per line."}
        className="min-h-40 font-normal"
        aria-label={title}
      />

      {saveError && (
        <p className="text-sm font-medium text-red-600">{saveError}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          One line = one memory. Empty lines are ignored. Nolë can also update
          these memories.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={isLoading || isSaving || !isDirty}
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
