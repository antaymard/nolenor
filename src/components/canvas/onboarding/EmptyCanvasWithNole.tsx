import { useNavigate } from "@tanstack/react-router";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  DEFAULT_CANVAS_BACKGROUND,
  previewStyle,
} from "@/lib/canvasBackground";
import { TbArrowRight } from "react-icons/tb";
import OnboardingChatInput from "./OnboardingChatInput";

type EmptyCanvasWithNoleProps = {
  canvasId: Id<"canvases">;
  canvasName: string;
};

const ONBOARDING_BACKGROUND_STYLE = previewStyle({
  ...DEFAULT_CANVAS_BACKGROUND,
  bgColor: "oklch(98.4% 0.003 247.858)",
  patternColor: "oklch(88.2% 0.059 254.128)",
});
export default function EmptyCanvasWithNole(_: EmptyCanvasWithNoleProps) {
  const navigate = useNavigate();

  // Sortie manuelle : revoir le canvas vide. Posée en `false` explicite (et
  // non retirée) pour que le hook ne re-entre pas aussitôt — le canvas est
  // encore vide à cet instant. Le param est nettoyé dès que le canvas ne
  // l'est plus, il n'est utile que pendant la phase vide.
  const exitOnboarding = () => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, onboarding: false }),
      replace: true,
    });
  };

  return (
    <div
      style={ONBOARDING_BACKGROUND_STYLE}
      className="flex h-screen w-screen flex-col items-center justify-center gap-6 px-25 py-20"
    >
      <div className="relative h-full w-full sm:mx-10 bg-white rounded-[18px] shadow-[0_3px_12px_rgba(15,23,42,0.12)] p-5 border border-slate-300 grid grid-cols-[2fr_1fr]">
        <div className="flex flex-col items-center text-center justify-center">
          {/*<img
            src="/favicon.svg"
            alt="Nolenor"
            className="size-12 border-2 rounded-full border-text"
          />*/}
          <div className="flex flex-col gap-5">
            <h1 className="text-4xl font-semibold tracking-tight ">
              What’s on your mind?
              {/*<SlotText text={title} options={{ rollBy: "word" }} />*/}
            </h1>
            <p className="text-[17px]">
              A project, notes, documents… Bring them here. Nolë helps you make
              sense of it all.
            </p>
          </div>
          <Button
            variant="ghost"
            className="absolute top-5 right-5"
            onClick={exitOnboarding}
          >
            Start from scratch
            <TbArrowRight />
          </Button>

          {/*Input héro : mêmes briques que le composer Nolë, sans choix de
              modèle — à l'envoi, l'onboarding se ferme et le canvas s'ouvre
              avec le panel sur le thread créé (cf. `OnboardingChatInput`).*/}
          <div className="mt-8 flex w-full justify-center">
            <OnboardingChatInput />
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl flex items-center justify-center mt-12 border border-dashed border-blue-500 text-blue-500 hover:bg-blue-100">
          <p>Drop files here (PDF, images, audio, links, .csv, .md, .txt)</p>
        </div>
      </div>
    </div>
  );
}
