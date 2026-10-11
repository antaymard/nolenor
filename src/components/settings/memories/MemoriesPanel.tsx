import { useMutation, useQuery } from "convex/react";
import { TbExclamationCircle } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  MAX_CANVAS_MEMORY_CHARS,
  MAX_USER_MEMORY_CHARS,
} from "@/../convex/lib/memoryLimits";
import { Spinner } from "@/components/shadcn/spinner";
import MemoryEditorCard from "./MemoryEditorCard";

/**
 * La mémoire de l'utilisateur, et celle du canvas depuis lequel les réglages
 * sont ouverts — celui-là seulement, sans choix d'un autre. Hors canvas (page
 * `/settings`), seule la mémoire utilisateur est proposée.
 */
export default function MemoriesPanel({
  canvasId,
}: {
  canvasId?: Id<"canvases">;
}) {
  const saveUserMemory = useMutation(api.memories.saveUserMemory);
  const userMemory = useQuery(api.memories.getUserMemory);

  return (
    <div className="space-y-4 p-2">
      <MemoryEditorCard
        storageKey="user"
        title="User memory"
        description="What Nolë remembers about you across all canvases."
        maxChars={MAX_USER_MEMORY_CHARS}
        rawContent={
          userMemory === undefined ? undefined : (userMemory?.content ?? null)
        }
        onSave={(entries) => saveUserMemory({ entries }).then(() => {})}
      />

      {canvasId ? (
        <CanvasMemory canvasId={canvasId} />
      ) : (
        <p className="px-1 text-sm text-slate-500">
          Open the settings from a canvas to edit what Nolë remembers about it.
        </p>
      )}
    </div>
  );
}

function CanvasMemory({ canvasId }: { canvasId: Id<"canvases"> }) {
  const saveCanvasMemory = useMutation(api.memories.saveCanvasMemory);
  const canvas = useQuery(api.canvases.readCanvas, { canvasId });
  // get/saveCanvasMemory exigent "owner" côté serveur : on ne les appelle pas
  // pour un canvas partagé, la query lèverait.
  const isOwner = canvas?._permission === "owner";
  const canvasMemory = useQuery(
    api.memories.getCanvasMemory,
    isOwner ? { canvasId } : "skip",
  );

  if (canvas === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface p-4 text-sm text-muted-foreground">
        <Spinner /> Loading canvas…
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-500">
        <TbExclamationCircle /> Only the owner of this canvas can edit its
        memory.
      </div>
    );
  }

  return (
    <MemoryEditorCard
      key={canvasId}
      storageKey={canvasId}
      title="Canvas memory"
      description={`What Nolë remembers about ${canvas.name ? `“${canvas.name}”` : "this canvas"}.`}
      maxChars={MAX_CANVAS_MEMORY_CHARS}
      rawContent={
        canvasMemory === undefined ? undefined : (canvasMemory?.content ?? null)
      }
      onSave={(entries) =>
        saveCanvasMemory({ canvasId, entries }).then(() => {})
      }
    />
  );
}
