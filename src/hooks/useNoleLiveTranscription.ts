import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  useLiveTranscription,
  type UseLiveTranscription,
  type UseLiveTranscriptionOptions,
} from "./useLiveTranscription";

export interface UseNoleLiveTranscription extends UseLiveTranscription {
  /** true tant que la config Convex n'est pas encore chargée. */
  configLoading: boolean;
  /** true si le voice-server n'est pas configuré (ou user non authentifié). */
  configMissing: boolean;
}

/**
 * Variante "app" de `useLiveTranscription` : récupère l'URL + le token du
 * voice-server depuis Convex (`api.voice.realtimeConfig`), de sorte que le token
 * ne soit jamais embarqué dans le bundle front. Le flux audio temps réel part
 * ensuite en direct du navigateur vers le voice-server (WebSocket).
 *
 * Exemple :
 *   const { start, stop, liveText, isListening } = useNoleLiveTranscription({
 *     onDone: ({ text }) => setUserInput((p) => (p ? p + " " + text : text)),
 *   });
 */
export function useNoleLiveTranscription(
  options: Omit<UseLiveTranscriptionOptions, "serverUrl" | "token"> = {},
): UseNoleLiveTranscription {
  const config = useQuery(api.voice.realtimeConfig);

  const live = useLiveTranscription({
    ...options,
    serverUrl: config?.url ?? null,
    token: config?.token ?? null,
  });

  return {
    ...live,
    configLoading: config === undefined,
    configMissing: config === null,
  };
}
