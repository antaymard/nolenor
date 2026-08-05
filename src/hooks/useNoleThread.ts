import { useCallback, useEffect, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "@/types";

/**
 * Resolves the conversation thread for the Nolë chat: reuses the user's latest
 * thread or creates one. Resolved once on mount (not subscribed), and can be
 * reset to a fresh thread.
 */
export function useNoleThread({ canvasId }: { canvasId: Id<"canvases"> }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const convex = useConvex();
  const startThread = useMutation(api.threads.startThread);

  const getOrCreateThread = useCallback(async (): Promise<string> => {
    const existing = await convex.query(api.threads.getLatestThread, {});
    if (existing && "threadId" in existing) return existing.threadId;
    const created = await startThread({ canvasId });
    return created.threadId;
  }, [convex, startThread, canvasId]);

  useEffect(() => {
    let cancelled = false;
    getOrCreateThread()
      .then((id) => {
        if (!cancelled) setThreadId(id);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Erreur lors de l'initialisation du thread:", error);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getOrCreateThread]);

  const resetThread = useCallback(async () => {
    setIsLoading(true);
    setThreadId(null);
    try {
      const created = await startThread({ canvasId });
      setThreadId(created.threadId);
    } catch (error) {
      console.error("Erreur lors du reset du thread:", error);
    } finally {
      setIsLoading(false);
    }
  }, [startThread, canvasId]);

  return { threadId, isLoading, resetThread };
}
