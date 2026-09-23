import NewCanvasButton from "@/components/app-shell/NewCanvasButton";
import { CANVAS_COVER_DOTS_STYLE } from "@/lib/canvasCover";

/**
 * Ce que voit un compte sans aucun canvas à lui. L'ancien `/` disait « No
 * workspace found » et laissait deviner le reste : ni ce qu'est un canvas, ni
 * ce qu'on peut en faire.
 */
export default function WelcomeBlock() {
  return (
    <div className="animate-appear-up flex overflow-hidden rounded-2xl border border-slate-200 bg-white max-md:flex-col">
      <div className="flex flex-1 flex-col gap-4 p-8 md:p-10">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome to Nolënor
          </h2>
          <p className="max-w-xl text-slate-600">
            A canvas is an infinite board. Drop in documents, images, audio,
            links and notes, connect them together, and ask Nolë — the
            assistant that reads everything on the canvas — to work through it
            with you.
          </p>
        </div>

        <div className="mt-2">
          <NewCanvasButton label="Create your first canvas" />
        </div>
      </div>

      <div
        className="flex items-center justify-center bg-blue-50 p-8 md:w-64"
        style={CANVAS_COVER_DOTS_STYLE}
        aria-hidden
      >
        <img src="/favicon.svg" alt="" className="size-20 drop-shadow-sm" />
      </div>
    </div>
  );
}
