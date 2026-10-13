import { useState } from "react";
import { useMutation } from "convex/react";
import {
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbMessageCircleOff,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { cn } from "@/lib/utils";
import type { AskedQuestion, QuestionResult } from "./activity/activityModel";

type Draft = { selected: string[]; text: string };
const EMPTY_DRAFT: Draft = { selected: [], text: "" };

const isAnswered = (draft: Draft) =>
  draft.selected.length > 0 || draft.text.trim().length > 0;

/**
 * Les questions de Nolë (`ask_user`, cf. convex/harness/kernelTools.ts).
 *
 * Tant qu'elles attendent : une question à la fois, paginée (« 1 of 3 »). Chaque
 * question propose ses options (choix simple ou multiple) et, en dessous, un
 * champ « Something else » pour répondre avec ses propres mots. Un choix simple
 * fait passer à la question suivante ; la dernière s'envoie avec « Submit »
 * (ou au clic quand il n'y a qu'une question à choix simple). « Skip » refuse
 * de répondre. L'utilisateur peut aussi répondre dans le champ du chat (le
 * serveur y route son message).
 *
 * Pendant que Nolë écrit la question (`pending`), la carte la montre sans
 * qu'on puisse y répondre encore. Une fois répondu, elle garde la trace :
 * réponses par question, texte libre, ou refus.
 */
export function QuestionCard({
  threadId,
  questions,
  result,
  canAnswer,
  pending = false,
  variant = "card",
}: {
  threadId?: string;
  questions: AskedQuestion[];
  result: QuestionResult | null;
  /** Le run attend bien cette réponse (thread `waiting`, dernier message). */
  canAnswer: boolean;
  /** Le tour est encore en cours : la question est peut-être en train de s'écrire. */
  pending?: boolean;
  /**
   * `inline` : sans cadre, pour vivre dans une autre carte (la carte de tâche
   * sous l'omnibar).
   */
  variant?: "card" | "inline";
}) {
  const answerQuestion = useMutation(api.harness.ingress.answerQuestion);
  // `questions` peut grandir après le montage (stream de l'input du tool) :
  // on lit les brouillons et la page toujours via des accesseurs tolérants.
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState(false);

  const inline = variant === "inline";
  const open = result === null && canAnswer;
  // Pas encore répondable, mais pas périmée non plus : on la montre telle quelle.
  const asking = result === null && (canAnswer || pending);
  const draftAt = (i: number) => drafts[i] ?? EMPTY_DRAFT;
  const last = questions.length - 1;
  const current = Math.min(page, Math.max(last, 0));
  const question = questions[current];
  const oneClick =
    questions.length === 1 &&
    !questions[0].multiSelect &&
    questions[0].options.length > 0;
  const firstMissing = questions.findIndex((_, i) => !isAnswered(draftAt(i)));
  const complete = firstMissing === -1;

  const patchDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((all) =>
      questions.map((_, j) => {
        const draft = all[j] ?? EMPTY_DRAFT;
        return j === i ? { ...draft, ...patch } : draft;
      }),
    );

  const send = async (
    answer: { question: string; selected: string[]; text?: string }[] | null,
  ) => {
    if (!threadId || sending) return;
    setSending(true);
    try {
      await answerQuestion({ threadId, answer });
    } finally {
      setSending(false);
    }
  };

  const payload = (override?: { index: number; draft: Draft }) =>
    questions.map((q, i) => {
      const draft = override?.index === i ? override.draft : draftAt(i);
      const text = draft.text.trim();
      return {
        question: q.question,
        selected: draft.selected,
        ...(text ? { text } : {}),
      };
    });

  const pick = (label: string) => {
    if (!question) return;
    const draft = draftAt(current);
    if (question.multiSelect) {
      patchDraft(current, {
        selected: draft.selected.includes(label)
          ? draft.selected.filter((l) => l !== label)
          : [...draft.selected, label],
      });
      return;
    }
    // Choix simple : exclusif avec le texte libre.
    const next = { selected: [label], text: "" };
    if (oneClick) {
      void send(payload({ index: current, draft: next }));
      return;
    }
    patchDraft(current, next);
    if (current < last) setPage(current + 1);
  };

  const type = (text: string) => {
    if (!question) return;
    patchDraft(
      current,
      question.multiSelect ? { text } : { text, selected: [] },
    );
  };

  const advance = () => {
    if (current < last) setPage(current + 1);
    else if (complete) void send(payload());
  };

  // Réponse donnée, refusée ou périmée : un résumé, sans pagination.
  if (!asking) {
    return (
      <div
        className={cn(
          "flex flex-col gap-3",
          !inline &&
            "rounded-xl border border-slate-200 bg-surface px-4 py-3 shadow-sm",
        )}
      >
        {questions.map((q, i) => (
          <AnsweredSection
            key={i}
            question={q}
            answer={answerFor(result, q.question)}
          />
        ))}
        {result?.kind === "text" && (
          <div className="border-l-2 border-slate-200 pl-2 text-sm whitespace-pre-wrap text-slate-600">
            {result.answer}
          </div>
        )}
        {result?.kind === "declined" && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <TbMessageCircleOff size={14} />
            Skipped
          </div>
        )}
        {result === null && (
          <span className="text-xs text-slate-400">Not answered.</span>
        )}
      </div>
    );
  }

  if (!question) return null;
  const draft = draftAt(current);
  const interactive = open && !sending;
  const isLast = current === last;

  return (
    <div
      className={cn(
        "flex flex-col",
        !inline &&
          "overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-3",
          inline ? "py-1" : "px-4 pt-3 pb-2",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {question.header && (
              <span className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                {question.header}
              </span>
            )}
            <div className="text-sm font-medium text-slate-800">
              <MarkdownText>{question.question}</MarkdownText>
            </div>
          </div>
          {questions.length > 1 && (
            <Pager page={current} total={questions.length} onChange={setPage} />
          )}
        </div>

        {question.multiSelect && (
          <span className="-mt-1.5 text-[11px] text-slate-400">
            Select all that apply.
          </span>
        )}

        <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {question.options.map((option, index) => {
            const chosen = draft.selected.includes(option.label);
            return (
              <button
                key={option.label}
                type="button"
                disabled={!interactive}
                onClick={() => pick(option.label)}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
                  interactive && "hover:bg-slate-50",
                  chosen && "bg-violet-50 hover:bg-violet-50",
                  !interactive && "cursor-default",
                )}
              >
                <OptionMarker
                  index={index}
                  multi={question.multiSelect}
                  checked={chosen}
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

          <label
            className={cn(
              "flex items-center gap-2.5 px-3 py-2",
              draft.text.trim() && "bg-violet-50",
            )}
          >
            <OptionMarker
              index={question.options.length}
              multi={question.multiSelect}
              checked={draft.text.trim().length > 0}
            />
            <input
              type="text"
              value={draft.text}
              disabled={!interactive}
              placeholder={
                question.options.length > 0 ? "Something else" : "Your answer"
              }
              onChange={(event) => type(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (isAnswered(draft)) advance();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
      </div>

      {open && (
        <div
          className={cn(
            "flex items-center gap-2",
            inline ? "pt-1" : "px-4 pt-1 pb-3",
          )}
        >
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
            {isLast && !complete && firstMissing !== current ? (
              <button
                type="button"
                onClick={() => setPage(firstMissing)}
                className="text-left text-violet-600 hover:underline"
              >
                Question {firstMissing + 1} has no answer yet.
              </button>
            ) : (
              // Sous l'omnibar (inline), pas de champ de chat en dessous.
              !inline && "Or reply in the chat box below."
            )}
          </span>
          <button
            type="button"
            disabled={sending}
            onClick={() => void send(null)}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            Skip
          </button>
          {!(oneClick && !draft.text.trim()) && (
            <button
              type="button"
              disabled={sending || !isAnswered(draft) || (isLast && !complete)}
              onClick={advance}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
            >
              {isLast ? "Submit" : "Next"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function answerFor(result: QuestionResult | null, question: string) {
  if (result?.kind !== "answers") return null;
  return (
    result.answers.find((a) => a.question === question) ?? {
      question,
      selected: [],
    }
  );
}

/** « ‹ 2 of 3 › ». */
function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const arrow =
    "rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex shrink-0 items-center gap-0.5 text-xs text-slate-500">
      <button
        type="button"
        aria-label="Previous question"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className={arrow}
      >
        <TbChevronLeft size={14} />
      </button>
      <span className="px-0.5 tabular-nums">
        {page + 1} of {total}
      </span>
      <button
        type="button"
        aria-label="Next question"
        disabled={page >= total - 1}
        onClick={() => onChange(page + 1)}
        className={arrow}
      >
        <TbChevronRight size={14} />
      </button>
    </div>
  );
}

/** Une question répondue (ou restée sans réponse) : l'énoncé et ce qui a été retenu. */
function AnsweredSection({
  question,
  answer,
}: {
  question: AskedQuestion;
  answer: { selected: string[]; text?: string } | null;
}) {
  const hasAnswer = answer && (answer.selected.length > 0 || answer.text);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-slate-500">
        <MarkdownText>{question.question}</MarkdownText>
      </div>
      {hasAnswer && (
        <div className="flex flex-col gap-0.5">
          {answer.selected.map((label) => (
            <span
              key={label}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-800"
            >
              <TbCheck size={14} className="shrink-0 text-violet-600" />
              {label}
            </span>
          ))}
          {answer.text && (
            <span className="border-l-2 border-violet-200 pl-2 text-sm whitespace-pre-wrap text-slate-700">
              {answer.text}
            </span>
          )}
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
