import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import toast from "react-hot-toast";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useNoleLiveTranscription } from "@/hooks/useNoleLiveTranscription";

/** Concatène un ajout au texte courant en gérant l'espace de séparation. */
function appendText(base: string, addition: string): string {
  const add = addition.trim();
  if (!add) return base;
  if (!base) return add;
  return /\s$/.test(base) ? base + add : base + " " + add;
}

const TOAST_POSITION = { position: "bottom-left" as const };

// Après une panne du voice-server (connexion impossible, erreur serveur), les
// dictées suivantes passent par le STT batch pendant ce délai, au lieu de
// re-échouer à chaque appui.
const LIVE_COOLDOWN_MS = 60_000;

/**
 * Speech-to-text du composer Nolë.
 *
 * Utilise la transcription LIVE (streaming via le voice-server) dès que la
 * config est disponible : le texte apparaît dans le composer au fil de la parole
 * et est finalisé au relâchement. Si le voice-server n'est pas configuré (ou
 * user non authentifié), ou s'il vient d'échouer (cooldown), on retombe
 * automatiquement sur le STT batch existant (Convex + Mistral).
 *
 * Toutes les erreurs (micro refusé, serveur injoignable, transcription en
 * échec, aucune parole détectée) sont remontées à l'utilisateur via toast —
 * plus d'échec silencieux.
 *
 * `startSTT` / `stopSTT` ont une identité STABLE (le statut live évolue en cours
 * de session, mais on ne veut pas re-binder `usePushToTalk` en plein appui).
 */
export function useNoleSpeechInput(
  userInput: string,
  setUserInput: Dispatch<SetStateAction<string>>,
) {
  // --- Moteur live (streaming) -------------------------------------------
  const baseRef = useRef("");
  const liveDisabledUntilRef = useRef(0);
  const live = useNoleLiveTranscription({
    onDone: ({ text }) => {
      if (text) setUserInput(appendText(baseRef.current, text));
      else toast("Aucune parole détectée.", TOAST_POSITION);
    },
    onError: (error) => {
      console.error("Live transcription error:", error.code, error.message);
      toast.error(error.message, TOAST_POSITION);
      // Panne côté serveur/réseau : on bascule sur le batch pour un temps.
      // (Pas pour mic_error : le batch a besoin du micro aussi.)
      if (error.code === "connect_failed" || error.code === "server_error") {
        liveDisabledUntilRef.current = Date.now() + LIVE_COOLDOWN_MS;
      }
    },
  });

  // Reflète le texte live dans le composer pendant qu'on parle. On reconstruit
  // toujours à partir de `baseRef` (le texte présent au démarrage), donc c'est
  // un remplacement idempotent — jamais de doublon.
  useEffect(() => {
    if (live.status === "connecting" || live.status === "listening") {
      setUserInput(appendText(baseRef.current, live.liveText));
    }
  }, [live.liveText, live.status, setUserInput]);

  // Réveille le voice-server à l'ouverture du chat et au retour sur l'onglet,
  // pour absorber le cold start sans garder d'instance allumée en permanence.
  const prewarm = live.prewarm;
  useEffect(() => {
    if (live.configLoading || live.configMissing) return;
    prewarm();
    window.addEventListener("focus", prewarm);
    return () => window.removeEventListener("focus", prewarm);
  }, [live.configLoading, live.configMissing, prewarm]);

  // --- Moteur batch (fallback) -------------------------------------------
  const onBatchTranscript = useCallback(
    (text: string) => {
      if (text) setUserInput((prev) => appendText(prev, text));
      else toast("Aucune parole détectée.", TOAST_POSITION);
    },
    [setUserInput],
  );
  const onBatchError = useCallback((message: string) => {
    toast.error(message, TOAST_POSITION);
  }, []);
  const batch = useSpeechToText(onBatchTranscript, onBatchError);

  // On préfère le live dès que la config voice-server est confirmée présente.
  const useLive = !live.configLoading && !live.configMissing;

  // Moteur effectivement utilisé par la session en cours (le cooldown après
  // panne peut forcer le batch même quand la config live est présente).
  const [activeEngine, setActiveEngine] = useState<"live" | "batch">("live");
  const activeEngineRef = useRef<"live" | "batch">("live");

  // Refs "latest" : startSTT/stopSTT restent stables tout en appelant la version
  // courante des moteurs.
  const userInputRef = useRef(userInput);
  userInputRef.current = userInput;
  const useLiveRef = useRef(useLive);
  useLiveRef.current = useLive;
  const liveStartRef = useRef(live.start);
  liveStartRef.current = live.start;
  const liveStopRef = useRef(live.stop);
  liveStopRef.current = live.stop;
  const batchStartRef = useRef(batch.start);
  batchStartRef.current = batch.start;
  const batchStopRef = useRef(batch.stop);
  batchStopRef.current = batch.stop;

  const startSTT = useCallback(async () => {
    const engine =
      useLiveRef.current && Date.now() >= liveDisabledUntilRef.current
        ? "live"
        : "batch";
    activeEngineRef.current = engine;
    setActiveEngine(engine);
    if (engine === "live") {
      baseRef.current = userInputRef.current;
      await liveStartRef.current();
    } else {
      await batchStartRef.current();
    }
  }, []);

  const stopSTT = useCallback(() => {
    if (activeEngineRef.current === "live") liveStopRef.current();
    else batchStopRef.current();
  }, []);

  // --- Statut unifié -----------------------------------------------------
  const liveActive = useLive && activeEngine === "live";
  const isRecording = liveActive
    ? live.status === "connecting" || live.status === "listening"
    : batch.status === "recording";
  const isTranscribing = liveActive
    ? live.status === "stopping"
    : batch.status === "transcribing";

  return {
    sttStatus: liveActive ? live.status : batch.status,
    isRecording,
    isTranscribing,
    sttBusy: isRecording || isTranscribing,
    startSTT,
    stopSTT,
    /** Texte live en cours (live uniquement) — pour un éventuel sous-titre. */
    liveText: live.liveText,
    /** Niveau micro 0..1 (live uniquement) — pour une animation. */
    micLevel: live.level,
  };
}
