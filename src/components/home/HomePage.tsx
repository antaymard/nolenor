import { useCallback, useState } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { Skeleton } from "@/components/shadcn/skeleton";
import OnboardingModal from "@/components/ui/OnboardingModal";
import {
  pendingTasksOf,
  useHomePendingTasks,
} from "@/hooks/useHomePendingTasks";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import HomeHeader from "./HomeHeader";
import ResumeCard from "./ResumeCard";
import WelcomeBlock from "./WelcomeBlock";
import WorkspaceGrid from "./WorkspaceGrid";

export default function HomePage() {
  const { ownCanvases, sharedCanvases, isLoading, deleteCanvas } =
    useUserCanvases();
  // Ce que Nolë a laissé en plan, tous workspaces confondus. Chargé à part des
  // canvases, et non greffé sur leur listing : la ligne `threadMetadata` d'un
  // thread est réécrite une fois par step LLM, et une query qui les mêlerait
  // rejouerait le listing complet des canvases à chaque battement d'un tour en
  // cours.
  const pendingTasks = useHomePendingTasks();
  // `undefined` = la modale décide seule (première visite) ; un booléen la
  // passe en piloté, pour rejouer le tour depuis les boutons de la page.
  const [replayTour, setReplayTour] = useState<boolean | undefined>(undefined);

  const handleDelete = useCallback(
    (canvasId: Id<"canvases">) => {
      // Pas de navigation ensuite : on est déjà sur la home, et la query
      // réactive retire la carte d'elle-même.
      void deleteCanvas(canvasId);
    },
    [deleteCanvas],
  );

  const startTour = useCallback(() => setReplayTour(true), []);

  // La liste arrive triée par récence : le premier canvas perso est le dernier
  // touché, c'est-à-dire celui vers lequel `/` redirigeait autrefois. Les
  // partagés sont exclus — un canvas modifié par son propriétaire n'est pas
  // « là où on en était ».
  const lastCanvas = ownCanvases[0];
  const isEmpty = !isLoading && ownCanvases.length === 0;

  return (
    <div className="min-h-dvh w-full overflow-y-auto bg-[#f7f7f8]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <HomeHeader
          onStartTour={startTour}
          canJump={ownCanvases.length + sharedCanvases.length > 0}
        />

        {isLoading ? (
          <HomeSkeleton />
        ) : isEmpty ? (
          <>
            <WelcomeBlock onStartTour={startTour} />
            {/* Un compte sans canvas à lui peut en avoir reçu en partage : ne
                pas les afficher le laisserait devant une page « vide » alors
                qu'il a du travail qui l'attend. */}
            {sharedCanvases.length > 0 && (
              <WorkspaceGrid
                ownCanvases={[]}
                sharedCanvases={sharedCanvases}
                pendingTasks={pendingTasks}
                onDelete={handleDelete}
              />
            )}
          </>
        ) : (
          <>
            {lastCanvas && (
              <ResumeCard
                canvas={lastCanvas}
                pendingTasks={pendingTasksOf(pendingTasks, lastCanvas._id)}
              />
            )}
            <WorkspaceGrid
              ownCanvases={ownCanvases}
              sharedCanvases={sharedCanvases}
              pendingTasks={pendingTasks}
              onDelete={handleDelete}
            />
          </>
        )}
      </div>

      <OnboardingModal open={replayTour} onOpenChange={setReplayTour} />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
