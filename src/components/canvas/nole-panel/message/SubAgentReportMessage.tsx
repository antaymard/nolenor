import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { cn } from "@/lib/utils";
import type { SubAgentReport } from "../chatHelpers";

/**
 * Le retour d'un lot de sous-agents, dans la conversation.
 *
 * Ce message porte le rôle `user` côté composant agent — c'est une entrée du
 * modèle — mais l'humain n'en est pas l'auteur, et le rendre comme une bulle
 * utilisateur serait un contresens : on lui prêterait des mots qu'il n'a pas
 * écrits. D'où un bloc distinct, à gauche comme les réponses de Nolë.
 *
 * Replié par défaut. Le rapport est rédigé pour le modèle, pas pour l'œil : ce
 * que l'humain a besoin de savoir, c'est qu'une tâche est revenue et laquelle.
 * Le corps est là pour qui veut vérifier — et c'est exactement le geste que le
 * prompt du worker recommande au parent (« trust but verify »).
 */
export function SubAgentReportMessage({
  reports,
}: {
  reports: SubAgentReport[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {reports.map((report, index) => (
        <ReportCard key={report.id || index} report={report} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: SubAgentReport }) {
  const [open, setOpen] = useState(false);
  const failed = report.status !== "success";
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "max-w-4/5 rounded-xl border text-xs",
        failed
          ? "border-red-200 bg-red-50/60"
          : "border-slate-200 bg-slate-50/60",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        <Chevron className="size-3 shrink-0 text-slate-400" />
        {failed ? (
          <TriangleAlert className="size-3 shrink-0 text-red-500" />
        ) : (
          <Bot className="size-3 shrink-0 text-slate-400" />
        )}
        <span className="truncate font-medium text-slate-700">
          {report.brief ||
            (failed ? "Sous-agent en échec" : "Rapport de sous-agent")}
        </span>
      </button>

      {open ? (
        <div className="border-t border-slate-200/70 px-2.5 py-2 text-slate-600">
          <MarkdownText>{report.body}</MarkdownText>
        </div>
      ) : null}
    </div>
  );
}
