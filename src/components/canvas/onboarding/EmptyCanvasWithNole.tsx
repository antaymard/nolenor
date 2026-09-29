import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { SlotText } from "slot-text/react";
import "slot-text/style.css";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  DEFAULT_CANVAS_BACKGROUND,
  previewStyle,
} from "@/lib/canvasBackground";
import { TbArrowRight } from "react-icons/tb";

type EmptyCanvasWithNoleProps = {
  canvasId: Id<"canvases">;
  canvasName: string;
};

const ONBOARDING_BACKGROUND_STYLE = previewStyle({
  ...DEFAULT_CANVAS_BACKGROUND,
  bgColor: "#fff",
  patternColor: "#bfdbfe",
});
export default function EmptyCanvasWithNole(_: EmptyCanvasWithNoleProps) {
  const navigate = useNavigate();

  // Même `displayName` que partout ailleurs (Settings → Account, puis provider).
  // `undefined` pendant le chargement, `null` pour un anonyme : les deux
  // retombent sur le titre générique (cf. `EmptyThreadSuggestions`).
  const me = useQuery(api.users.me);
  const firstName = me?.displayName?.trim()?.split(/\s+/)?.[0] || null;

  // Sortie manuelle : revoir le canvas vide (l'effet du hook ne re-ajoute le
  // param que si le canvas est toujours vide — donc rester ici, c'est
  // impossible : re-cliquer ne refait qu'un aller-retour. C'est volontaire
  // pour les fondations : l'échappatoire sert à prévisualiser, pas à rester).
  const exitOnboarding = () => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, onboarding: undefined }),
      replace: true,
    });
  };

  const TEXTS = [
    {
      title: "What’s on your mind?",
      subtitle:
        "A project, notes, documents… Bring them here. Nolë helps you make sense of it all.",
    },
  ] as const;

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

          {/*Input*/}
          <div className=>
            
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl flex items-center justify-center mt-12 border border-dashed border-blue-500 text-blue-500 hover:bg-blue-100">
          <p>Drop files here (PDF, images, audio, links)</p>
        </div>
      </div>
    </div>
  );
}
