import { createFileRoute } from "@tanstack/react-router";
import PageHeader from "@/components/app-shell/PageHeader";
import TaskList from "@/components/home/TaskList";
import { Skeleton } from "@/components/shadcn/skeleton";
import { useHomePendingTasks } from "@/hooks/useHomePendingTasks";
import { useTaskCanvases } from "@/hooks/useTaskCanvases";
import { useUserCanvases } from "@/hooks/useUserCanvases";

/**
 * L'Inbox : toutes les tâches de Nolë en attente, sans la limite de la home.
 * Même liste, mêmes gestes — c'est la page vers laquelle la home renvoie quand
 * elle en a trop à montrer.
 */
export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const pending = useHomePendingTasks();
  const { isLoading: canvasesLoading } = useUserCanvases();
  const taskCanvases = useTaskCanvases();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 md:px-10 md:py-10">
      <PageHeader
        title="Inbox"
        subtitle="Everything Nolë did that you haven't looked at yet, across all your canvases."
      />

      {pending.isLoading || canvasesLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <TaskList tasks={pending.tasks} canvases={taskCanvases} />
      )}
    </div>
  );
}
