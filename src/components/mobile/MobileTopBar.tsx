import { Link } from "@tanstack/react-router";
import { HiOutlineCog } from "react-icons/hi";
import { TbChevronDown } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import CanvasStatus from "@/components/canvas/on-canvas-ui/CanvasStatus";
import SharingModal from "@/components/canvas/on-canvas-ui/SharingModal";

export default function MobileTopBar({
  canvasName,
  onOpenCanvasSwitcher,
}: {
  canvasName?: string;
  onOpenCanvasSwitcher: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b px-2 py-2"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        onClick={onOpenCanvasSwitcher}
        className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-sm font-medium hover:bg-slate-100"
      >
        <span className="truncate">{canvasName ?? "Workspace"}</span>
        <TbChevronDown size={14} className="shrink-0 opacity-70" />
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <CanvasStatus />
        {/* Autonome : rend son propre trigger, et null si l'user n'est pas owner. */}
        <SharingModal />
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings" title="Settings" aria-label="Settings">
            <HiOutlineCog size={18} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
