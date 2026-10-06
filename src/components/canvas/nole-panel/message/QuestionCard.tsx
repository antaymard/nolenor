import { useState } from "react";
import { useMutation } from "convex/react";
import {
  TbCheck,
  TbMessageQuestion,
  TbMessageCircleOff,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { cn } from "@/lib/utils";
import type {
  AskedQuestion,
  QuestionResult,
} from "./activity/activityModel";

/**
 * Les questions de Nolë (`ask_user`, cf. convex/harness/kernelTools.ts).
 *
 * Tant qu'elles attendent : chaque option est une ligne (libellé + précision),
 * à choix simple ou multiple. Une seule question à choix simple part au clic ;
 * sinon on coche, puis « Submit ». L'utilisateur peut aussi répondre avec ses
 * mots dans le champ du chat (le serveur y route son message), ou refuser.
 *
 * Une fois répondu, la carte garde la trace : options choisies, texte libre,
 * ou refus.
 */
export function QuestionCard({
  threadId,
  questions,
  result,
  canAnswer,
}: {
  threadId?: string;
  questions: AskedQuestion[];
  result: QuestionResult | null;
  /** Le run attend bien cette réponse (thread `waiting`, dernier message). */
  canAnswer: boolean;
}) {
  const answerQuestion = useMutation(api.harness.ingress.answerQuestion);
  const [selected, setSelected] = useState<string[][]>(() =>
    questions.map(() => []),
  );
  const [sending, setSending] = useState(false);

  const open = result === null && canAnswer;
  const oneClick =
    questions.length === 1 &&
    !questions[0].multiSelect &&
    questions[0].options.length > 0;
  const answerable = questions.every((q) => q.options.length > 0);
  const complete = selected.every((labels) => labels.length > 0);

  const send = async (answer: { question: string; selected: string[] }[] | null) => {
    if (!threadId || sending) return;
    setSending(true);
    try {
      await answerQuestion({ threadId, answer });
    } finally {
      setSending(false);
    }
  };

  const toggle = (questionIndex: number, label: string) => {
    const question = questions[questionIndex];
    if (oneClick) {
      void send([{ question: question.question, selected: [label] }]);
      return;
    }
    setSelected((current) =>
      current.map((labels, i) => {
        if (i !== questionIndex) return labels;
        if (!question.multiSelect) return [label];
        return labels.includes(label)
          ? labels.filter((l) => l !== label)
          : [...labels, label];
      }),
    );
  };

  const submit = () =>
    void send(
      questions.map((q, i) => ({ question: q.question, selected: selected[i] })),
    );

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-violet-50/60 px-3 py-2 text-xs font-medium text-violet-700">
        <TbMessageQuestion size={15} className="shrink-0" />
        {questions.length > 1
          ? `Nolë has ${questions.length} questions`
          : "Nolë has a question"}
      </div>

      <div className="flex flex-col gap-4 px-3 py-3">
        {questions.map((question, questionIndex) => (
          <QuestionSection
            key={questionIndex}
            question={question}
            selected={selected[questionIndex]}
            answered={answeredFor(result, question.question)}
            interactive={open && !sending}
            onPick={(label) => toggle(questionIndex, label)}
          />
        ))}

        {result?.kind === "text" && (
          <div className="border-l-2 border-violet-200 pl-2 text-sm whitespace-pre-wrap text-slate-600">
            {result.answer}
          </div>
        )}
        {result?.kind === "declined" && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <TbMessageCircleOff size={14} />
            Declined
          </div>
        )}
        {result === null && !canAnswer && (
          <span className="text-xs text-slate-400">Not answered.</span>
        )}
      </div>

      {open && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
            {answerable
              ? "Or reply in your own words in the chat box below."
              : "Reply in the chat box below."}
          </span>
          <button
            type="button"
            disabled={sending}
            onClick={() => void send(null)}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            Decline
          </button>
          {answerable && !oneClick && (
            <button
              type="button"
              disabled={sending || !complete}
              onClick={submit}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
            >
              Submit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function answeredFor(result: QuestionResult | null, question: string) {
  if (result?.kind !== "answers") return null;
  return result.answers.find((a) => a.question === question)?.selected ?? [];
}

function QuestionSection({
  question,
  selected,
  answered,
  interactive,
  onPick,
}: {
  question: AskedQuestion;
  selected: string[];
  /** Les options retenues, une fois répondu par la carte. */
  answered: string[] | null;
  interactive: boolean;
  onPick: (label: string) => void;
}) {
  const chosen = answered ?? selected;
  return (
    <div className="flex flex-col gap-2">
      {question.header && (
        <span className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
          {question.header}
        </span>
      )}
      <div className="text-sm font-medium text-slate-800">
        <MarkdownText>{question.question}</MarkdownText>
      </div>
      {question.multiSelect && interactive && (
        <span className="-mt-1 text-[11px] text-slate-400">
          Select all that apply.
        </span>
      )}

      {question.options.length > 0 && (
        <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {question.options.map((option, index) => {
            const isChosen = chosen.includes(option.label);
            // Répondu : seules les options retenues restent lisibles.
            const dimmed = answered !== null && !isChosen;
            return (
              <button
                key={option.label}
                type="button"
                disabled={!interactive}
                onClick={() => onPick(option.label)}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
                  interactive && "hover:bg-slate-50",
                  isChosen && "bg-violet-50",
                  dimmed && "opacity-45",
                  !interactive && "cursor-default",
                )}
              >
                <OptionMarker
                  index={index}
                  multi={question.multiSelect}
                  checked={isChosen}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-slate-800">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-xs leading-snug text-slate-500">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Numéro au repos, coche une fois choisi ; carré pour le choix multiple. */
function OptionMarker({
  index,
  multi,
  checked,
}: {
  index: number;
  multi: boolean;
  checked: boolean;
}) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center border text-[11px] font-medium",
        multi ? "rounded-md" : "rounded-full",
        checked
          ? "border-violet-600 bg-violet-600 text-white"
          : "border-slate-300 text-slate-500",
      )}
    >
      {checked ? <TbCheck size={12} /> : index + 1}
    </span>
  );
}
