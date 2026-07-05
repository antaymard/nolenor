import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useCanvasStore } from "@/stores/canvasStore";
import { api } from "@/../convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { HiMiniChevronDown } from "react-icons/hi2";
import { LuUndo, LuRedo } from "react-icons/lu";
import { AiOutlinePlusCircle } from "react-icons/ai";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
import CanvasFormModal from "../CanvasFormModal";
import { memo } from "react";
import { useShallow } from "zustand/shallow";

function TopLeftToolbar({
  undo,
  redo,
}: {
  undo: () => void;
  redo: () => void;
}) {
  const canvas = useCanvasStore(useShallow((state) => state.canvas));
  const deleteCanvas = useMutation(api.canvases.deleteCanvas);
  const { isAuthenticated } = useConvexAuth();

  const { canvases: userCanvases } =
    useQuery(api.canvases.getUserCanvases) ||
    ({} as {
      canvases: Array<{ _id: Id<"canvases">; name: string }>;
    });

  if (userCanvases === undefined) {
    return null;
  }

  function renderUserCanvases() {
    return userCanvases.map((c) => (
      <DropdownMenuItem key={c._id} asChild>
        <Link key={c._id} to="/canvas/$canvasId" params={{ canvasId: c._id }}>
          {c.name}
          {c._id === canvas?._id && (
            <span className="text-xs ml-2 italic">Current</span>
          )}
        </Link>
      </DropdownMenuItem>
    ));
  }

  return (
    <div className="h-12 flex items-center gap-2">
      <div className="bg-card p-2 rounded h-full border flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={!isAuthenticated}
              variant="ghost"
              className="flex items-center gap-1 disabled:opacity-100"
            >
              <img src="/favicon.svg" alt="Nolenor logo" className="h-5" />
              {isAuthenticated && <HiMiniChevronDown size={20} />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="flex items-center justify-between">
              Your workspaces
              <Dialog>
                <DialogTrigger>
                  <AiOutlinePlusCircle size={14} />
                </DialogTrigger>
                <CanvasFormModal mode="create" />
              </Dialog>
            </DropdownMenuLabel>
            {renderUserCanvases()}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="font-semibold p-1 px-2 rounded-sm">
          {canvas?.name || "Untitled"}
        </h1>
      </div>

      {isAuthenticated && (
        <div className="bg-card p-2 rounded h-full border flex items-center">
          <Button variant="ghost" onClick={undo}>
            <LuUndo />
          </Button>
          <Button variant="ghost" onClick={redo}>
            <LuRedo />
          </Button>
        </div>
      )}
    </div>
  );
}

export default memo(TopLeftToolbar);
