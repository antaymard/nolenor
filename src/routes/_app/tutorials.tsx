import { createFileRoute } from "@tanstack/react-router";
import { TbPlayerPlayFilled } from "react-icons/tb";
import PageHeader from "@/components/app-shell/PageHeader";
import { CANVAS_COVER_DOTS_STYLE } from "@/lib/canvasCover";
import { cn } from "@/lib/utils";

/**
 * Les tutoriels — pas encore écrits. La page existe déjà pour que l'entrée de
 * la sidebar mène quelque part qui ait l'air voulu, et pour annoncer ce qui
 * viendra plutôt que d'afficher un vide.
 */
export const Route = createFileRoute("/_app/tutorials")({
  component: TutorialsPage,
});

const UPCOMING = [
  {
    title: "Your first canvas",
    description: "Add documents, notes and links, then arrange them your way.",
    tint: "bg-blue-50",
    icon: "text-blue-600",
  },
  {
    title: "Working with Nolë",
    description: "Attach blocks, give instructions, review what it changed.",
    tint: "bg-violet-50",
    icon: "text-violet-600",
  },
  {
    title: "Tables and apps",
    description: "Structured data and small tools that live on the canvas.",
    tint: "bg-teal-50",
    icon: "text-teal-700",
  },
  {
    title: "Connect Claude or ChatGPT",
    description: "Use your canvases from other assistants through MCP.",
    tint: "bg-orange-50",
    icon: "text-orange-700",
  },
  {
    title: "Capture on the go",
    description: "Voice notes, photos and links from your phone.",
    tint: "bg-green-50",
    icon: "text-green-700",
  },
  {
    title: "Keyboard shortcuts",
    description: "Move around and create blocks without the mouse.",
    tint: "bg-slate-100",
    icon: "text-slate-600",
  },
];

function ComingSoon() {
  return (
    <span className="text-xs font-semibold text-slate-500">Coming soon</span>
  );
}

function TutorialsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 md:px-10 md:py-10">
      <PageHeader
        title="Tutorials"
        subtitle="Short guides to get the most out of your canvases and Nolë."
      />

      <div className="flex gap-6 rounded-2xl border border-violet-100 bg-violet-50/40 p-5 max-md:flex-col md:p-6">
        <div
          className="flex h-44 shrink-0 items-center justify-center rounded-xl bg-violet-100 md:w-80"
          style={CANVAS_COVER_DOTS_STYLE}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg">
            <TbPlayerPlayFilled className="size-6" />
          </span>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <span className="self-start rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">
            Start here
          </span>
          <h2 className="text-xl font-bold text-slate-900">
            Nolënor in two minutes
          </h2>
          <p className="max-w-md text-sm text-slate-600">
            Create a canvas, drop in a few documents, and ask Nolë to work
            through them with you.
          </p>
          <ComingSoon />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {UPCOMING.map((tutorial) => (
          <div
            key={tutorial.title}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div
              className={cn("flex h-28 items-center justify-center", tutorial.tint)}
              style={CANVAS_COVER_DOTS_STYLE}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full bg-white shadow-sm",
                  tutorial.icon,
                )}
              >
                <TbPlayerPlayFilled className="size-4" />
              </span>
            </div>
            <div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-4">
              <h3 className="font-bold text-slate-900">{tutorial.title}</h3>
              <p className="text-sm text-slate-600">{tutorial.description}</p>
              <ComingSoon />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
