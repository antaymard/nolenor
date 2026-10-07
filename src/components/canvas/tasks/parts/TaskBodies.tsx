import { useState } from "react";
import { useMutation } from "convex/react";
import { TbRefresh } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { QuestionCard } from "@/components/canvas/nole-panel/message/QuestionCard";
import type { AskedQuestion } from "@/components/canvas/nole-panel/message/activity/activityModel";
import { cn } from "@/lib/utils";

/**
 * Les corps d'une carte de tâche : un seul à la fois, choisi par
 * `resolveTaskView`. Chacun arrête la propagation du clic là où il a ses
 * propres actions, pour ne pas ouvrir la conversation en même temps.
 */

/** Pendant le run : ce que Nolë vient d'annoncer. */
export function TaskActivityBody({ text }: { text: string }) {
  return <span className="truncate pl-7 text-[11px] text-slate-500">{text}</span>;
}

/** Nolë attend une réponse : on répond sur place. */
export function TaskQuestionBody({
  threadId,
  questions,
}: {
  threadId: string;
  questions: AskedQuestion[];
}) {
  return (
    <div className="pl-7" onClick={(event) => event.stopPropagation()}>
      <QuestionCard
        threadId={threadId}
        questions={questions}
        result={null}
        canAnswer
        variant="inline"
      />
    </div>
  );
}

/** Échec ou arrêt — partiel quand le canvas a déjà bougé. */
export function TaskErrorBody({
  runId,
  message,
  partial,
  retryable,
}: {
  runId: Id<"runs">;
  message: string;
  partial: boolean;
  retryable: boolean;
}) {
  const retry = useMutation(api.runs.retryRun);
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="flex items-start gap-2 pl-7">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px]">
        <span className="line-clamp-2 text-slate-600">{message}</span>
        {partial && (
          <span className="text-slate-400">
            Some changes were made before it stopped.
          </span>
        )}
      </div>
      {retryable && (
        <button
          type="button"
          disabled={retrying}
          onClick={(event) => {
            event.stopPropagation();
            setRetrying(true);
            void retry({ runId }).finally(() => setRetrying(false));
          }}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-50"
        >
          <TbRefresh size={12} />
          Retry
        </button>
      )}
    </div>
  );
}

/** Une réponse qui compte : lisible sur place, sans ouvrir le chat. */
export function TaskAnswerBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-1 pl-7">
      <div
        className={cn(
          "text-sm whitespace-pre-wrap text-slate-700",
          !expanded && "line-clamp-4",
        )}
      >
        <MarkdownText>{text}</MarkdownText>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((value) => !value);
        }}
        className="self-start text-[11px] font-medium text-violet-600 hover:underline"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
