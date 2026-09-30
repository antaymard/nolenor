import { useNavigate } from "@tanstack/react-router";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  DEFAULT_CANVAS_BACKGROUND,
  previewStyle,
} from "@/lib/canvasBackground";
import { useOnboardingIngestStore } from "@/stores/onboardingIngestStore";
import { TbArrowRight } from "react-icons/tb";
import OnboardingChatInput from "./OnboardingChatInput";
import OnboardingDropzone from "./OnboardingDropzone";

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
  // l'est plus, il n'est utile que pendant la phase vide. Clôt aussi la
  // session d'ingest éventuelle : les uploads en cours continuent en tâche de
  // fond, leurs nodes atterriront sur le canvas révélé.
  const exitOnboarding = () => {
    useOnboardingIngestStore.getState().reset();
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
          <img
            src="/favicon.svg"
            alt="Nolenor"
            className="size-12 border-2 rounded-full border-text mb-5"
          />
          <div className="flex flex-col gap-5">
            <h1 className="text-4xl font-semibold tracking-tight ">
              What’s on your mind?
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

        {/*Drop de fichiers : les nodes naissent en arrière-plan sur le
            canvas, la modale reste ouverte (session d'ingest), on les voit
            en fermant (cf. `OnboardingDropzone`).*/}
        <OnboardingDropzone />
      </div>
    </div>
  );
}
