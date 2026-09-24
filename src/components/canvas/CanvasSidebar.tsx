import {
  SidebarProvider,
  SidebarTrigger,
  Sidebar,
  SidebarInset,
  useSidebar,
} from "@/components/shadcn/sidebar";
import { Button } from "@/components/shadcn/button";
import type { Id } from "@/../convex/_generated/dataModel";
import { Link, useNavigate } from "@tanstack/react-router";
import { Dialog } from "@/components/shadcn/dialog";
import CanvasFormModal from "./CanvasFormModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { buttonVariants } from "@/components/shadcn/button";
import { HiDotsVertical } from "react-icons/hi";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import CanvasHistoryControls from "@/components/canvas/on-canvas-ui/CanvasHistoryControls";
import AppSidebar from "@/components/app-shell/AppSidebar";
import {
  EMOJI_FONT_STYLE,
  canvasCover,
  canvasGlyph,
  type CanvasAppearance,
} from "@/lib/canvasCover";

type SidebarCanvas = CanvasAppearance & {
  _id: Id<"canvases">;
  name: string;
  description?: string;
};

export default function CanvasSidebar({
  children,
  canvasId,
}: {
  children: React.ReactNode;
  canvasId: Id<"canvases">;
}) {
  const navigate = useNavigate();
  const { userCanvases, ownCanvases, sharedCanvases, deleteCanvas } =
    useUserCanvases();

  const currentCanvas = userCanvases?.find((c) => c._id === canvasId);
  const isOwnCanvas = ownCanvases.some((c) => c._id === canvasId);

  const [canvasToDelete, setCanvasToDelete] = useState<{
    id: Id<"canvases">;
    name: string;
  } | null>(null);

  const [canvasToEdit, setCanvasToEdit] = useState<SidebarCanvas | null>(
    null,
  );

  const confirmDeleteCanvas = async () => {
    if (!canvasToDelete) return;
    const deletedId = canvasToDelete.id;

    setCanvasToDelete(null);
    const deleted = await deleteCanvas(deletedId);
    if (!deleted) return;

    // Supprimer le canvas ouvert laissait l'app sur son URL : les queries
    // repassaient en erreur et on restait bloqué sur un écran « ce canvas
    // n'existe pas ». `/` ramène sur la page d'accueil.
    if (deletedId === canvasId) {
      void navigate({ to: "/" });
    }
  };

  const editCanvas = (c: SidebarCanvas) => setCanvasToEdit(c);
  const askDeleteCanvas = (c: SidebarCanvas) =>
    setCanvasToDelete({ id: c._id, name: c.name });

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar variant="sidebar">
        <CanvasSidebarPanel
          canvasId={canvasId}
          userCanvases={userCanvases}
          ownCanvases={ownCanvases}
          sharedCanvases={sharedCanvases}
          onEdit={editCanvas}
          onDelete={askDeleteCanvas}
        />
      </Sidebar>

      <SidebarInset className="flex-1">
        <div className="absolute top-3 left-4 z-10 animate-appear canvas-ui-container h-8 pr-2 max-w-72">
          <SidebarTrigger />
          {currentCanvas?.icon && (
            <span
              className="shrink-0 text-base leading-none"
              style={EMOJI_FONT_STYLE}
              aria-hidden
            >
              {currentCanvas.icon}
            </span>
          )}
          <span className="text-sm font-bold truncate max-w-48">
            {currentCanvas?.name ?? "..."}
          </span>
          {isOwnCanvas && currentCanvas && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label="Canvas options"
                >
                  <HiDotsVertical size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setCanvasToEdit(currentCanvas)}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setCanvasToDelete({
                      id: currentCanvas._id,
                      name: currentCanvas.name,
                    })
                  }
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <CanvasHistoryControls canvasId={canvasId} />
        </div>
        {children}
      </SidebarInset>

      <Dialog
        open={canvasToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setCanvasToEdit(null);
        }}
      >
        <CanvasFormModal
          key={canvasToEdit?._id ?? "none"}
          mode="edit"
          canvasId={canvasToEdit?._id}
          initialValues={
            canvasToEdit
              ? {
                  name: canvasToEdit.name,
                  description: canvasToEdit.description ?? "",
                  icon: canvasToEdit.icon,
                  color: canvasToEdit.color,
                  coverImage: canvasToEdit.coverImage,
                }
              : undefined
          }
          onSuccess={() => setCanvasToEdit(null)}
        />
      </Dialog>

      <AlertDialog
        open={canvasToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setCanvasToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              {canvasToDelete
                ? `“${canvasToDelete.name}” will be permanently deleted. Its blocks and conversations go with it. This action cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCanvas}
              className={buttonVariants({ variant: "destructive" })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}

/**
 * Le contenu de la sidebar du canvas : la même que celle de la home
 * (`AppSidebar`), avec la liste des canvas au milieu.
 *
 * Composant à part pour lire l'état du `SidebarProvider` : repliée, la sidebar
 * reste montée, et on coupe alors les queries du badge Inbox et de l'usage IA
 * (cf. `AppSidebar`, `live`).
 */
function CanvasSidebarPanel({
  canvasId,
  userCanvases,
  ownCanvases,
  sharedCanvases,
  onEdit,
  onDelete,
}: {
  canvasId: Id<"canvases">;
  userCanvases: SidebarCanvas[] | undefined;
  ownCanvases: SidebarCanvas[];
  sharedCanvases: SidebarCanvas[];
  onEdit: (canvas: SidebarCanvas) => void;
  onDelete: (canvas: SidebarCanvas) => void;
}) {
  const { open } = useSidebar();

  return (
    <AppSidebar live={open}>
      {!userCanvases ? (
        <p className="px-2 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <CanvasListSection title="Canvases">
            {ownCanvases.length === 0 ? (
              <p className="px-2 text-sm text-slate-500">No canvas yet</p>
            ) : (
              ownCanvases.map((c, index) => (
                <CanvasListItem
                  key={c._id}
                  canvas={c}
                  active={c._id === canvasId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  index={index}
                />
              ))
            )}
          </CanvasListSection>

          {sharedCanvases.length > 0 && (
            <CanvasListSection title="Shared with you">
              {sharedCanvases.map((c, index) => (
                <CanvasListItem
                  key={c._id}
                  canvas={c}
                  active={c._id === canvasId}
                  index={ownCanvases.length + index}
                />
              ))}
            </CanvasListSection>
          )}
        </div>
      )}
    </AppSidebar>
  );
}

function CanvasListSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Un canvas de la liste : sa tuile de couleur et son icône (les mêmes que sa
 * carte sur la home, cf. `canvasCover`), son nom, et le menu Edit / Delete
 * pour les siens.
 */
function CanvasListItem({
  canvas,
  active,
  onEdit,
  onDelete,
  index,
}: {
  canvas: SidebarCanvas;
  active: boolean;
  /** Absents sur les canvas partagés : on n'y a pas ces droits. */
  onEdit?: (canvas: SidebarCanvas) => void;
  onDelete?: (canvas: SidebarCanvas) => void;
  index: number;
}) {
  const cover = canvasCover(canvas.color);

  return (
    <div
      className={cn(
        "group animate-appear-up flex items-center gap-1 rounded-lg pr-1 transition-colors",
        active ? "bg-white shadow-sm" : "hover:bg-slate-200/60",
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <Link
        to="/canvas/$canvasId"
        params={{ canvasId: canvas._id }}
        aria-current={active ? "page" : undefined}
        className="flex h-9 min-w-0 flex-1 items-center gap-2.5 pl-2 text-sm"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md font-bold text-white",
            canvas.icon ? "text-xs" : "text-[10px]",
            cover.tile,
          )}
          style={canvas.icon ? EMOJI_FONT_STYLE : undefined}
          aria-hidden
        >
          {canvasGlyph(canvas)}
        </span>
        <span
          className={cn(
            "truncate",
            active ? "font-bold text-slate-900" : "font-medium text-slate-700",
          )}
        >
          {canvas.name}
        </span>
      </Link>

      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${canvas.name}`}
              className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <HiDotsVertical size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(canvas)}>
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={() => onDelete(canvas)}
                className="text-destructive"
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
