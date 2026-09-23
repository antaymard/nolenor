import { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import NewCanvasButton from "@/components/app-shell/NewCanvasButton";
import PageHeader from "@/components/app-shell/PageHeader";
import { Skeleton } from "@/components/shadcn/skeleton";
import { useHomePendingTasks } from "@/hooks/useHomePendingTasks";
import { useTaskCanvases } from "@/hooks/useTaskCanvases";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import TaskList from "./TaskList";
import WelcomeBlock from "./WelcomeBlock";
import WorkspaceGrid from "./WorkspaceGrid";

/** Au-delà, la home renvoie vers l'Inbox plutôt que de devenir une liste. */
const HOME_TASKS_LIMIT = 5;

function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const me = useQuery(api.users.me);
  const { ownCanvases, sharedCanvases, isLoading, deleteCanvas } =
    useUserCanvases();
  // Ce que Nolë a laissé en plan, tous canvas confondus. Chargé à part des
  // canvases, et non greffé sur leur listing : la ligne `threadMetadata` d'un
  // thread est réécrite une fois par step LLM, et une query qui les mêlerait
  // rejouerait le listing complet des canvases à chaque battement d'un tour en
  // cours.
  const pending = useHomePendingTasks();
  const taskCanvases = useTaskCanvases();

  const handleDelete = useCallback(
    (canvasId: Id<"canvases">) => {
      // Pas de navigation ensuite : on est déjà sur la home, et la query
      // réactive retire la carte d'elle-même.
      void deleteCanvas(canvasId);
    },
    [deleteCanvas],
  );

  const visibleTaskCount = useMemo(
    () => pending.tasks.filter((task) => taskCanvases.has(task.canvasId)).length,
    [pending.tasks, taskCanvases],
  );

  const name = me?.displayName;
  const title = `${greeting(new Date().getHours())}${name ? `, ${name}` : ""}`;
  const hasNoOwnCanvas = !isLoading && ownCanvases.length === 0;
  // « Tout est fait » n'a pas de sens pour un compte qui n'a encore rien fait.
  const subtitle =
    visibleTaskCount > 0
      ? `${visibleTaskCount} ${visibleTaskCount === 1 ? "task needs" : "tasks need"} your attention.`
      : hasNoOwnCanvas
        ? "Let's set up your first canvas."
        : "You're all caught up.";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-9 px-4 py-8 md:px-10 md:py-10">
      <PageHeader
        title={title}
        subtitle={isLoading ? undefined : subtitle}
        // La sidebar porte déjà le bouton sur desktop ; sur mobile elle est
        // repliée, c'est donc ici qu'on le trouve.
        action={<NewCanvasButton className="md:hidden" />}
      />

      {isLoading ? (
        <HomeSkeleton />
      ) : (
        <>
          {/* Un compte sans canvas à lui peut en avoir reçu en partage : on
              l'accueille, et on lui montre quand même ce qui l'attend. */}
          {hasNoOwnCanvas && <WelcomeBlock />}

          {/* Section masquée quand il n'y a rien : la sidebar compte déjà les
              tâches, et un « tout est fait » permanent en tête de page
              repousserait les canvas pour ne rien dire. L'Inbox, elle,
              l'affiche. */}
          {visibleTaskCount > 0 && (
            <TaskList
              tasks={pending.tasks}
              canvases={taskCanvases}
              limit={HOME_TASKS_LIMIT}
            />
          )}

          <WorkspaceGrid
            ownCanvases={ownCanvases}
            sharedCanvases={sharedCanvases}
            pendingTasks={pending.byCanvas}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48 rounded-md" />
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-44 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
