import { useState } from "react";
import { TbChevronDown, TbChevronRight, TbSubtask } from "react-icons/tb";
import { MarkdownText } from "@/components/ai/MarkdownText";

const STATUS_LABEL: Record<string, string> = {
  done: "Background task finished",
  error: "Background task failed",
  aborted: "Background task stopped",
};

/**
 * Le rapport d'un sous-agent d'arrière-plan, posté dans le fil par l'app et
 * non par l'utilisateur : une ligne repliée, le rapport à la demande. Nolë y
 * répond juste en dessous.
 */
export function SubagentResultNotice({
  task,
  status,
  report,
}: {
  task: string;
  status: string;
  report: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-left"
      >
        <TbSubtask size={16} className="shrink-0 text-violet-500" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">
            {STATUS_LABEL[status] ?? STATUS_LABEL.done}
          </span>
          {task ? ` · ${task}` : null}
        </span>
        {open ? <TbChevronDown size={14} /> : <TbChevronRight size={14} />}
      </button>
      {open && (
        <div className="border-t border-slate-200 pt-2 whitespace-pre-wrap text-slate-700">
          <MarkdownText>{report}</MarkdownText>
        </div>
      )}
    </div>
  );
}
