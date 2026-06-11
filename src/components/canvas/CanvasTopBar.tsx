import { useCanvasStore } from "../../stores/canvasStore";
import { Link } from "@tanstack/react-router";
import { HiOutlineCog } from "react-icons/hi";
import { TbLayoutSidebarLeftExpand } from "react-icons/tb";
import { useSidebar } from "../shadcn/sidebar";
import { TbCloudCheck, TbCloudUp, TbCloudX } from "react-icons/tb";
import { memo } from "react";

function CanvasTopBar() {
  const canvas = useCanvasStore((state) => state.canvas);
  const { setOpen } = useSidebar();

  return (
    <>
      <div className="h-15 flex items-center justify-between px-4 border-b border-gray-300 bg-white ">
        <div className="rounded-sm border border-gray-300 flex divide-x divide-gray-300">
          <button
            className="hover:bg-gray-200 p-2 flex items-center rounded-xs"
            title="Workspaces"
            type="button"
            onClick={() => setOpen(true)}
          >
            <TbLayoutSidebarLeftExpand size={18} />
          </button>
          <Link
            to="/settings"
            className="hover:bg-gray-200 p-2 flex items-center rounded-xs"
            title="Settings"
          >
            <HiOutlineCog size={18} />
          </Link>
        </div>
        <h1 className="font-semibold text-lg">
          {canvas?.name || "Untitled"}
        </h1>
        <div>
          <CanvasStatus />
        </div>
      </div>
    </>
  );
}

function CanvasStatus() {
  const status = useCanvasStore((state) => state.status);
  const size = 22;

  switch (status) {
    case "idle":
      return (
        <span className="text-sm text-gray-500">
          <TbCloudCheck size={size} />
        </span>
      );
    case "unsynced":
      return (
        <span className="text-sm text-yellow-500">
          <TbCloudUp size={size} />
        </span>
      );
    case "saving":
      return (
        <span className="text-sm text-blue-500">
          <TbCloudUp size={size} />
        </span>
      );
    case "saved":
      return (
        <span className="text-sm text-green-500">
          <TbCloudCheck size={size} />
        </span>
      );
    case "error":
      return (
        <span className="text-sm text-red-500">
          <TbCloudX size={size} />
        </span>
      );
    default:
      return null;
  }
}

export default memo(CanvasTopBar);
