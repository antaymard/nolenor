import { Link, useNavigate } from "@tanstack/react-router";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Button } from "@/components/shadcn/button";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
import CanvasFormModal from "@/components/canvas/CanvasFormModal";
import { TbHome, TbPlus, TbTrash } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useUserCanvases } from "@/hooks/useUserCanvases";

interface MobileCanvasSwitcherSheetProps {
  canvasId: Id<"canvases">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Le switcher de workspace ouvert depuis le nom du canvas, en top bar. */
export default function MobileCanvasSwitcherSheet({
  canvasId,
  open,
  onOpenChange,
}: MobileCanvasSwitcherSheetProps) {
  const navigate = useNavigate();
  const { userCanvases, ownCanvases, sharedCanvases, deleteCanvas } =
    useUserCanvases();

  const handleSelectCanvas = (id: Id<"canvases">) => {
    onOpenChange(false);
    void navigate({
      to: "/canvas/$canvasId",
      params: { canvasId: id },
    });
  };

  const handleDeleteCanvas = async (id: Id<"canvases">) => {
    const deleted = await deleteCanvas(id);
    // Supprimer le canvas affiché laissait l'écran sur une URL morte : plus
    // rien à charger, et aucune sortie depuis le shell mobile.
    if (deleted && id === canvasId) {
      onOpenChange(false);
      void navigate({ to: "/" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[85vw] sm:max-w-sm p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Workspaces</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Sortie vers la home : sans elle, le shell mobile n'offre aucun
              chemin vers la page d'accueil. */}
          <Link
            to="/"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2 rounded-md px-2 py-3 text-sm font-medium hover:bg-slate-100"
          >
            <TbHome size={16} className="text-muted-foreground" />
            All workspaces
          </Link>

          <div className="flex items-center justify-between mb-2 mt-1">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
              Workspaces
            </h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <TbPlus size={16} />
                </Button>
              </DialogTrigger>
              <CanvasFormModal mode="create" />
            </Dialog>
          </div>

          {!userCanvases ? (
            <div className="text-sm text-muted-foreground px-2 py-2">
              Loading...
            </div>
          ) : userCanvases.length === 0 ? (
            <div className="text-sm text-muted-foreground px-2 py-2">
              No workspaces
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {ownCanvases.map((canvas) => (
                <CanvasRow
                  key={canvas._id}
                  active={canvas._id === canvasId}
                  name={canvas.name}
                  onSelect={() => handleSelectCanvas(canvas._id)}
                  onDelete={() => void handleDeleteCanvas(canvas._id)}
                />
              ))}
              {sharedCanvases.length > 0 && (
                <>
                  <h4 className="px-2 pt-3 text-xs text-muted-foreground uppercase tracking-wider">
                    Shared with you
                  </h4>
                  {sharedCanvases.map((canvas) => (
                    <CanvasRow
                      key={canvas._id}
                      active={canvas._id === canvasId}
                      name={canvas.name}
                      onSelect={() => handleSelectCanvas(canvas._id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CanvasRow({
  name,
  active,
  onSelect,
  onDelete,
}: {
  name: string;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex-1 min-w-0 text-left text-sm font-medium px-2 py-3 rounded-md truncate",
          active ? "bg-slate-200" : "hover:bg-slate-100",
        )}
      >
        {name}
      </button>
      {onDelete && (
        <ConfirmableButton
          title={`Delete workspace "${name}"?`}
          text="Its nodes and conversations go with it."
          confirmLabel="Delete workspace"
          destructive
          onConfirm={onDelete}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 opacity-50 hover:opacity-100 hover:text-red-500"
            aria-label="Delete workspace"
          >
            <TbTrash size={15} />
          </Button>
        </ConfirmableButton>
      )}
    </div>
  );
}
