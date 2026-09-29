import { useNavigate } from "@tanstack/react-router";
import type { Id } from "@/../convex/_generated/dataModel";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import { Button } from "@/components/shadcn/button";

type EmptyCanvasWithNoleProps = {
  canvasId: Id<"canvases">;
  canvasName: string;
};

/**
 * Fondations de l'onboarding canvas vide : rendu à la place du canvas
 * React Flow quand l'URL porte `?onboarding=true` (cf.
 * `useEmptyCanvasOnboarding`).
 *
 * Pour l'instant, une page centrée avec le vrai `ChatContainer` de Nolë —
 * mêmes suggestions, même composer, même thread du canvas — et une sortie de
 * secours vers le canvas vide. Le premier node créé par Nolë fait sortir de
 * l'onboarding tout seul (le hook retire le param).
 *
 * Doit rester monté sous le `ReactFlowProvider` de la route canvas :
 * `ChatContainer` → `useNoleChat` → `useReactFlow` (contexte du message,
 * viewport). C'est le cas : `CanvasContent` rend ce composant à l'intérieur.
 */
export default function EmptyCanvasWithNole({
  canvasName,
}: EmptyCanvasWithNoleProps) {
  const navigate = useNavigate();

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

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-y-auto bg-white px-6 py-10">
      <header className="flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border-2 border-brand bg-brand/10">
          <NoleIcon size={22} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            Start {canvasName} with Nolë
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe what you want — Nolë creates the first nodes on this
            canvas for you.
          </p>
        </div>
      </header>

      <div className="h-[min(560px,60vh)] w-full max-w-2xl">
        <ChatContainer />
      </div>

      <Button variant="ghost" size="sm" onClick={exitOnboarding}>
        Skip for now, show me the blank canvas
      </Button>
    </div>
  );
}
