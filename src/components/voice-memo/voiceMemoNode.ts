import {
  getDefaultNodeDataValues,
  nodeDataConfig,
} from "@/../convex/config/nodeConfig";
import type { UploadedFileData } from "@/hooks/useFilesUpload";
import type { VoiceMemoTarget } from "@/stores/voiceMemoStore";

/**
 * Le node que devient un mémo vocal : un node audio ordinaire, aux dimensions
 * par défaut du type, centré sur le point visé. Partagé par les deux chemins
 * de création (canvas ouvert, ou création directe après l'avoir quitté) pour
 * qu'ils posent exactement le même node.
 */

const audioConfig = nodeDataConfig.find((config) => config.type === "audio");
if (!audioConfig) throw new Error("[voiceMemoNode] no audio node config");

const { width, height } = audioConfig.defaultDimensions;
const color = audioConfig.defaultColor ?? "default";

export function voiceMemoNodeShape(target: VoiceMemoTarget) {
  return {
    type: "audio" as const,
    width,
    height,
    color,
    position: {
      x: target.center.x - width / 2,
      y: target.center.y - height / 2,
    },
  };
}

export function buildVoiceMemoValues(
  uploaded: UploadedFileData,
  { duration, label }: { duration: number; label: string },
): Record<string, unknown> {
  return {
    ...(getDefaultNodeDataValues("audio") as Record<string, unknown>),
    audio: {
      ...uploaded,
      duration,
      peaks: [],
      label,
      cover: null,
    },
  };
}
