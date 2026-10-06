import { useState } from "react";
import { useMutation } from "convex/react";
import { TbMessageQuestion } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { cn } from "@/lib/utils";

/**
 * Une question de Nolë (`ask_user`). Tant qu'elle attend, les options se
 * cliquent, et un message tapé dans le composer y répond aussi (le serveur
 * l'y route). Une fois répondue, la réponse s'affiche sous la question.
 */
export function QuestionCard({
  threadId,
  question,
  options,
  answer,
  canAnswer,
}: {
  threadId?: string;
  question: string;
  options: string[];
  answer: string | null;
  /** Le run attend bien cette réponse (thread `waiting`, dernier message). */
  canAnswer: boolean;
}) {
  const answerQuestion = useMutation(api.harness.ingress.answerQuestion);
  const [sending, setSending] = useState<string | null>(null);

  const pick = async (option: string) => {
    if (!threadId || sending) return;
    setSending(option);
    try {
      await answerQuestion({ threadId, answer: option });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
      <div className="flex items-start gap-2 text-slate-800">
        <TbMessageQuestion size={18} className="mt-0.5 shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <MarkdownText>{question}</MarkdownText>
        </div>
      </div>

      {answer !== null ? (
        <div className="ml-6 border-l-2 border-violet-200 pl-2 text-sm whitespace-pre-wrap text-slate-600">
          {answer}
        </div>
      ) : canAnswer ? (
        <div className="ml-6 flex flex-col gap-2">
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={sending !== null}
                  onClick={() => void pick(option)}
                  className={cn(
                    "rounded-full border border-violet-300 bg-surface px-2.5 py-1 text-sm text-violet-700 transition-colors",
                    "hover:bg-violet-100 disabled:opacity-60",
                    sending === option && "bg-violet-100",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <span className="text-[11px] text-slate-400">
            {options.length > 0
              ? "Or type your own answer below."
              : "Type your answer below."}
          </span>
        </div>
      ) : (
        <span className="ml-6 text-[11px] text-slate-400">Not answered.</span>
      )}
    </div>
  );
}
