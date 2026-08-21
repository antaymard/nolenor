import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  useLiveTranscription,
  type LiveTranscriptionProvider,
  type LiveVocabularyEntry,
  type UseLiveTranscription,
  type UseLiveTranscriptionOptions,
} from "./useLiveTranscription";

/**
 * Moteur de transcription live utilisé par l'app.
 *
 * Hardcodé le temps de valider Gladia en conditions réelles ; l'étape suivante
 * est de le servir depuis Convex (`api.voice.realtimeConfig`) pour basculer
 * sans redéployer le front.
 *
 * Prérequis côté voice-server : `GLADIA_API_KEY` doit être renseignée, sinon
 * l'upgrade WebSocket `/v1/gladia/realtime` est rejeté (503) et le composer
 * retombe sur le STT batch après le message d'erreur.
 */
const PROVIDER: LiveTranscriptionProvider = "gladia";

/**
 * Langues candidates de la dictée. L'app est en français mais les termes
 * techniques et les noms de produits sont souvent dictés en anglais, d'où le
 * code-switching plutôt qu'une langue forcée.
 */
const LANGUAGES = ["fr", "en"];

/**
 * Vocabulaire métier injecté dans la session Gladia : les noms propres que la
 * transcription générique massacre systématiquement. Volontairement court —
 * chaque entrée biaise la reconnaissance, une liste trop large produit des faux
 * positifs. À terme, alimenté par les noms de templates/skills de
 * l'utilisateur.
 */
const VOCABULARY: LiveVocabularyEntry[] = [
  "Nolenor",
  {
    value: "Nolë",
    pronunciations: ["nolé", "no lé", "nolay"],
    intensity: 0.6,
  },
  "canvas",
];

/**
 * Secondes de silence qui finalisent une utterance. Le défaut Gladia (0.05 s)
 * découpe à la moindre respiration ; ~0.3 s garde des phrases entières, ce qui
 * donne une meilleure ponctuation sans ajouter de latence perceptible en
 * push-to-talk.
 */
const ENDPOINTING_S = 0.3;

export interface UseNoleLiveTranscription extends UseLiveTranscription {
  /** true tant que la config Convex n'est pas encore chargée. */
  configLoading: boolean;
  /** true si le voice-server n'est pas configuré (ou user non authentifié). */
  configMissing: boolean;
}

/**
 * Variante "app" de `useLiveTranscription` : récupère l'URL + le token du
 * voice-server depuis Convex (`api.voice.realtimeConfig`), de sorte que le token
 * ne soit jamais embarqué dans le bundle front, et fixe le moteur de
 * transcription ainsi que ses réglages. Le flux audio temps réel part ensuite en
 * direct du navigateur vers le voice-server (WebSocket).
 *
 * Exemple :
 *   const { start, stop, liveText, isListening } = useNoleLiveTranscription({
 *     onDone: ({ text }) => setUserInput((p) => (p ? p + " " + text : text)),
 *   });
 */
export function useNoleLiveTranscription(
  options: Omit<
    UseLiveTranscriptionOptions,
    "serverUrl" | "token" | "provider"
  > = {},
): UseNoleLiveTranscription {
  const config = useQuery(api.voice.realtimeConfig);

  const live = useLiveTranscription({
    // Réglages du moteur d'abord : les options du caller restent prioritaires.
    languages: LANGUAGES,
    codeSwitching: true,
    vocabulary: VOCABULARY,
    endpointing: ENDPOINTING_S,
    ...options,
    provider: PROVIDER,
    serverUrl: config?.url ?? null,
    token: config?.token ?? null,
  });

  return {
    ...live,
    configLoading: config === undefined,
    configMissing: config === null,
  };
}
