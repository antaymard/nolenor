import { useEffect } from "react";
import { useRunDuration } from "@/hooks/useThreadRunStatus";
import type { PendingTask } from "@/lib/threadRunStatus";
import { resolveTaskView } from "./taskView";
import { TaskShell } from "./parts/TaskShell";
import { TaskHeader } from "./parts/TaskHeader";
import {
  TaskActivityBody,
  TaskAnswerBody,
  TaskAttachedNodes,
  TaskErrorBody,
  TaskQuestionBody,
} from "./parts/TaskBodies";
import { TaskFooter } from "./parts/TaskFooter";

/**
 * Une tâche de Nolë (un run), en une carte. Les règles — quoi montrer, avec
 * quel accent — sont dans `resolveTaskView` ; ici on ne fait qu'assembler les
 * briques de `parts/` : coque, en-tête, un corps, un pied.
 */
export default function TaskCard({
  task,
  onOpen,
  onDismiss,
}: {
  task: PendingTask;
  /** Ouvre la conversation de la tâche. */
  onOpen: (threadId: string) => void;
  onDismiss: (task: PendingTask) => void;
}) {
  const view = resolveTaskView(task);
  const duration = useRunDuration(task, view.status === "running");

  // Rien à montrer : la carte s'écarte d'elle-même.
  const { autoDismissMs } = view;
  useEffect(() => {
    if (autoDismissMs === null) return;
    const timer = setTimeout(() => onDismiss(task), autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss, task]);

  const body = view.body;
  return (
    <TaskShell view={view} onOpen={() => onOpen(task.threadId)}>
      <TaskHeader
        status={view.status}
        request={task.request || task.title || "Nolë"}
        context={task.title}
        duration={duration}
        onDismiss={view.dismissible ? () => onDismiss(task) : undefined}
      />
      {body?.kind === "activity" && <TaskActivityBody text={body.text} />}
      {body?.kind === "question" && (
        <TaskQuestionBody threadId={task.threadId} questions={body.questions} />
      )}
      {body?.kind === "error" && (
        <TaskErrorBody
          runId={task.runId}
          message={body.message}
          partial={body.partial}
          retryable={body.retryable}
        />
      )}
      {body?.kind === "answer" && (
        <>
          <TaskAttachedNodes nodes={task.attachedNodes} />
          <TaskAnswerBody text={body.text} />
        </>
      )}
      <TaskFooter nodes={view.nodes} pending={view.pending} />
    </TaskShell>
  );
}
