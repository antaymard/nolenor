import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { TbExclamationCircle } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  MAX_CANVAS_MEMORY_CHARS,
  MAX_USER_MEMORY_CHARS,
} from "@/../convex/lib/memoryLimits";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import MemoryEditorCard from "./MemoryEditorCard";

export default function MemoriesPanel() {
  const saveUserMemory = useMutation(api.memories.saveUserMemory);
  const saveCanvasMemory = useMutation(api.memories.saveCanvasMemory);
  const userMemory = useQuery(api.memories.getUserMemory);

  // Sélecteur owned-only : même source que l'export (triés par updatedAt
  // desc), pas de backend en plus. Les canvas partagés n'apparaissent pas
  // ici, et get/saveCanvasMemory exigent "owner" côté serveur.
  const {
    results: canvases,
    status,
    loadMore,
  } = usePaginatedQuery(api.dataExport.listCanvasesForExport, {}, {
    initialNumItems: 50,
  });

  const [selectedCanvasId, setSelectedCanvasId] =
    useState<Id<"canvases"> | null>(null);

  // Sélection par défaut : le canvas le plus récent. Si la sélection
  // disparaît (suppression), on retombe sur le premier.
  useEffect(() => {
    if (canvases.length === 0) {
      setSelectedCanvasId(null);
      return;
    }
    if (
      selectedCanvasId === null ||
      !canvases.some((canvas) => canvas._id === selectedCanvasId)
    ) {
      setSelectedCanvasId(canvases[0]._id);
    }
  }, [canvases, selectedCanvasId]);

  const canvasMemory = useQuery(
    api.memories.getCanvasMemory,
    selectedCanvasId ? { canvasId: selectedCanvasId } : "skip",
  );

  const isListingCanvases = status === "LoadingFirstPage";

  return (
    <div className="space-y-4 p-2">
      <MemoryEditorCard
        storageKey="user"
        title="User memory"
        description="What Nolë remembers about you across all canvases."
        maxChars={MAX_USER_MEMORY_CHARS}
        rawContent={userMemory === undefined ? undefined : (userMemory?.content ?? null)}
        onSave={(entries) => saveUserMemory({ entries }).then(() => {})}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">Canvas memory</h2>
          {!isListingCanvases && canvases.length > 0 && (
            <select
              className="block w-full max-w-md rounded-md border border-gray-300 bg-white p-2 text-sm"
              value={selectedCanvasId ?? ""}
              onChange={(event) =>
                setSelectedCanvasId(event.target.value as Id<"canvases">)
              }
              aria-label="Select a canvas"
            >
              {canvases.map((canvas) => (
                <option key={canvas._id} value={canvas._id}>
                  {canvas.name} ({canvas.nodeCount} node
                  {canvas.nodeCount === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          )}
        </div>

        {isListingCanvases ? (
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-4 text-sm text-muted-foreground">
            <Spinner /> Loading your canvases…
          </div>
        ) : canvases.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">
            <TbExclamationCircle /> You have no canvas yet — canvas memories
            will appear here once you create one.
          </div>
        ) : (
          <>
            {status === "CanLoadMore" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadMore(50)}
              >
                Load more canvases
              </Button>
            )}
            {selectedCanvasId && (
              <MemoryEditorCard
                key={selectedCanvasId}
                storageKey={selectedCanvasId}
                title="Canvas memory"
                description="What Nolë remembers about this canvas. Only canvases you created are listed."
                maxChars={MAX_CANVAS_MEMORY_CHARS}
                rawContent={
                  canvasMemory === undefined
                    ? undefined
                    : (canvasMemory?.content ?? null)
                }
                onSave={(entries) =>
                  saveCanvasMemory({
                    canvasId: selectedCanvasId,
                    entries,
                  }).then(() => {})
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
