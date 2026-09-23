import { TbPlus } from "react-icons/tb";
import CanvasFormModal from "@/components/canvas/CanvasFormModal";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
import { cn } from "@/lib/utils";

/**
 * L'action principale de l'app : créer un canvas. Toujours dans la couleur de
 * marque, pour qu'on la trouve sans la chercher.
 *
 * Le dialogue est embarqué dans le bouton : la création navigue vers le nouveau
 * canvas, ce qui démonte le shell et referme le tout.
 */
export default function NewCanvasButton({
  label = "New canvas",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className={cn(
            "h-11 gap-2 border-0 bg-(--brand) px-4 font-semibold text-white shadow-sm hover:bg-(--brand) hover:opacity-90",
            className,
          )}
        >
          <TbPlus className="size-[18px]" strokeWidth={2.4} />
          {label}
        </Button>
      </DialogTrigger>
      <CanvasFormModal mode="create" />
    </Dialog>
  );
}
