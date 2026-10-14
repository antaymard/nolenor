import { useEffect } from "react";
import { useMutation } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import { generateLlmId } from "@/../convex/lib/llmId";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useFileUpload } from "@/hooks/useFilesUpload";
import {
  isVoiceMemoUnsaved,
  registerVoiceMemoDeps,
  useVoiceMemoStore,
} from "@/stores/voiceMemoStore";
import { buildVoiceMemoValues, voiceMemoNodeShape } from "./voiceMemoNode";

/**
 * Monté une fois à la racine : tient l'enregistreur et fournit au store du
 * mémo vocal ce qui demande React (upload, mutation), et garde l'onglet tant
 * qu'un mémo n'est pas sauvé.
 * À la racine et pas dans le canvas : un mémo arrêté en quittant son canvas
 * doit encore pouvoir s'uploader et se créer une fois le canvas démonté.
 */
export default function VoiceMemoController() {
  const { startRecording, stopRecording, reset, audioBlob, stream } =
    useAudioRecorder();
  const { uploadFile } = useFileUpload();
  const createWithNodeData = useMutation(api.nodes.createWithNodeData);

  useEffect(
    () =>
      registerVoiceMemoDeps({
        recorder: { start: startRecording, stop: stopRecording, reset },
        uploadFile: (file, onProgress) =>
          uploadFile(file, undefined, onProgress),
        buildValues: buildVoiceMemoValues,
        createOnServer: async (values, target) => {
          const { color, ...shape } = voiceMemoNodeShape(target);
          await createWithNodeData({
            nodes: [
              {
                id: generateLlmId(),
                node: {
                  canvasId: target.canvasId,
                  ...shape,
                  zIndex: target.zIndex,
                  color,
                  variant: "default",
                },
                nodeDataValues: values,
              },
            ],
          });
        },
        onSavedElsewhere: () => {
          toast.success("Voice memo saved to the canvas where you recorded it");
        },
      }),
    [createWithNodeData, reset, startRecording, stopRecording, uploadFile],
  );

  useEffect(() => {
    if (!audioBlob) return;
    useVoiceMemoStore.getState().onRecorded(audioBlob);
    reset();
  }, [audioBlob, reset]);

  useEffect(() => {
    useVoiceMemoStore.setState({ stream });
  }, [stream]);

  const unsaved = useVoiceMemoStore(isVoiceMemoUnsaved);
  useEffect(() => {
    if (!unsaved) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [unsaved]);

  return null;
}
