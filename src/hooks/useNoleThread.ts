import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState } from "react";

type UseNoleThreadOptions = {
  subscribeToLatestThread?: boolean;
};

/**
 * Hook pour gérer un thread de conversation avec Nole
 */
export function useNoleThread({
  subscribeToLatestThread = true,
}: UseNoleThreadOptions = {}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const convex = useConvex();
  const latestThread = useQuery(
    api.threads.getLatestThread,
    subscribeToLatestThread ? {} : "skip",
  );
  const startThread = useMutation(api.threads.startThread);

  useEffect(() => {
    if (!subscribeToLatestThread) {
      return;
    }

    const initThread = async () => {
      try {
        // First, check if there's an existing thread
        if (latestThread !== undefined) {
          if (latestThread && "threadId" in latestThread) {
            // Use the existing thread
            setThreadId(latestThread.threadId);
            setIsLoading(false);
          } else {
            // No existing thread, create a new one
            const result = await startThread({});
            setThreadId(result.threadId);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error("Erreur lors de l'initialisation du thread:", error);
        setIsLoading(false);
      }
    };

    void initThread();
  }, [startThread, latestThread, subscribeToLatestThread]);

  useEffect(() => {
    if (subscribeToLatestThread) {
      return;
    }

    let isCancelled = false;

    const initThreadOnce = async () => {
      try {
        const existingThread = await convex.query(
          api.threads.getLatestThread,
          {},
        );

        if (isCancelled) {
          return;
        }

        if (existingThread && "threadId" in existingThread) {
          setThreadId(existingThread.threadId);
          return;
        }

        const result = await startThread({});

        if (isCancelled) {
          return;
        }

        setThreadId(result.threadId);
      } catch (error) {
        if (!isCancelled) {
          console.error("Erreur lors de l'initialisation du thread:", error);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void initThreadOnce();

    return () => {
      isCancelled = true;
    };
  }, [convex, startThread, subscribeToLatestThread]);

  const resetThread = async () => {
    setIsLoading(true);
    setThreadId(null);
    try {
      const result = await startThread({});
      setThreadId(result.threadId);
    } catch (error) {
      console.error("Erreur lors du reset du thread:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return { threadId, isLoading, resetThread };
}
