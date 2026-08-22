import { TbPlayerPlay, TbPlus } from "react-icons/tb";
import CanvasFormModal from "@/components/canvas/CanvasFormModal";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";

interface WelcomeBlockProps {
  onStartTour: () => void;
}

/**
 * Ce que voit un compte sans aucun workspace. L'ancien `/` disait « No
 * workspace found » et laissait deviner le reste : ni ce qu'est un workspace,
 * ni ce qu'on peut en faire.
 */
export default function WelcomeBlock({ onStartTour }: WelcomeBlockProps) {
  return (
    <div className="animate-appear-up rounded-2xl border border-gray-200 bg-white p-8 md:p-10">
      <div className="flex max-w-xl flex-col gap-4">
        <img
          src="/favicon.svg"
          alt=""
          aria-hidden
          className="h-12 w-12"
        />

        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome to Nolënor
          </h2>
          <p className="text-gray-600">
            A workspace is an infinite canvas. Drop in documents, images,
            audio, links and notes, connect them together, and ask Nolë — the
            assistant that reads everything on the canvas — to work through it
            with you.
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="h-11 bg-(--brand) border-0 font-medium text-white hover:opacity-90">
                <TbPlus size={16} />
                Create your first workspace
              </Button>
            </DialogTrigger>
            <CanvasFormModal mode="create" />
          </Dialog>

          <Button
            variant="outline"
            onClick={onStartTour}
            className="h-11 font-medium"
          >
            <TbPlayerPlay size={15} />
            Take the tour
          </Button>
        </div>
      </div>
    </div>
  );
}
