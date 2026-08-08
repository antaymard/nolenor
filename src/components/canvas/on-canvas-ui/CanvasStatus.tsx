import { TbCloudCheck, TbCloudUp, TbCloudX } from "react-icons/tb";
import { useCanvasStore } from "@/stores/canvasStore";

/** État de synchronisation du canvas, affiché desktop et mobile. */
export default function CanvasStatus({ size = 16 }: { size?: number }) {
  const status = useCanvasStore((state) => state.status);

  switch (status) {
    case "idle":
    case "saved":
      return (
        <span className="text-green-500" title="Synced">
          <TbCloudCheck size={size} />
        </span>
      );
    case "unsynced":
    case "saving":
      return (
        <span className="text-yellow-500" title="Saving...">
          <TbCloudUp size={size} />
        </span>
      );
    case "error":
      return (
        <span className="text-red-500" title="Sync error">
          <TbCloudX size={size} />
        </span>
      );
    default:
      return null;
  }
}
