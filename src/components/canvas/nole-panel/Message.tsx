import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { memo, useDeferredValue, useState, useMemo } from "react";
import { MarkdownText } from "@/components/ai/MarkdownText";
import type { TextPart } from "@/types/domain/message.types";
import { RiLoaderLine } from "react-icons/ri";
import { cn } from "@/lib/utils";
import { TbAlertCircle, TbBrain, TbChevronDown, TbTool } from "react-icons/tb";
import { matchLlmIdsInText } from "@/../convex/lib/llmId";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import type { Components } from "react-markdown";

type ToolPartState = "input-streaming" | "output-available" | "output-error";

function preprocessTextWithNodeLinks(text: string): string {
  if (!text) return "";
  // Cherche spécifiquement les 3 évolutions des LLM IDs custom :
  // 1: 000a000a (3 chiffres, 1 lettre répété)
  // 2: Abc1Def2 (3 lettres, 1 chiffre répété)
  // 3: a000a000a (1 lettre puis blocs de 3 chiffres, 1 lettre)
  return text.replace(
    /\b((?:\d{3}[A-Za-z])+|(?:[A-Za-z]{3}\d)+|[A-Za-z](?:\d{3}[A-Za-z])+)\b/g,
    (match) => `[${match}](#node-${match})`,
  );
}

const markdownComponents: Components = {
  a: ({ href, children }) => {
    if (href?.startsWith("#node-")) {
      const nodeId = href.replace("#node-", "");
      return <MentionedNodeCard nodeId={nodeId} inline />;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-blue-500 hover:underline"
      >
        {children}
      </a>
    );
  },
};

export const Message = memo(function Message({
  message,
}: {
  message: UIMessage;
}) {
  const isUser = message.role === "user";
  const userText = extractUserMessageForDisplay(message.text ?? "");

  // Pour les messages utilisateur, afficher simplement le texte
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="rounded whitespace-pre-wrap p-3 bg-slate-200 border border-slate-400 text-text max-w-4/5">
          <MarkdownText>{userText}</MarkdownText>
        </div>
      </div>
    );
  }

  // Pour les messages assistant, iterer sur les parts
  const parts = message.parts ?? [];
  const isProcessing = message.status === "streaming";
  const messageError = getMessageErrorText(message);

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "whitespace-pre-wrap flex flex-col gap-2",
          "p-2 py-3 w-full",
          {
            "bg-red-100": message.status === "failed",
          },
        )}
      >
        {parts.map((part, index) => {
          // Ignorer les step-start (marqueurs de debut d'etape)
          if (part.type === "step-start") {
            return null;
          }

          if (part.type === "reasoning") {
            return <ReasoningPartRenderer key={index} part={part} />;
          }

          // Afficher les parts texte avec Markdown
          if (part.type === "text") {
            return <TextPartRenderer key={index} part={part as TextPart} />;
          }

          // Afficher un placeholder unique pour tous les tool calls
          if (part.type.startsWith("tool-")) {
            const partState = (
              "state" in part ? part.state : "input-streaming"
            ) as ToolPartState;
            const toolName = part.type.replace("tool-", "");
            const toolError = getToolPartErrorText(part, partState);
            const debugInput =
              isRecord(part) && "input" in part
                ? (part.input as unknown)
                : undefined;
            const debugOutput =
              isRecord(part) && "output" in part
                ? (part.output as unknown)
                : undefined;
            return (
              <ToolPlaceholder
                key={index}
                state={partState}
                name={toolName}
                error={toolError}
                input={debugInput}
                output={debugOutput}
              />
            );
          }

          return null;
        })}

        {isProcessing && (
          <div className="flex items-center py-1 px-1">
            <RiLoaderLine size={15} className="animate-spin text-slate-400" />
          </div>
        )}

        {message.status === "failed" && (
          <ErrorInline message={messageError || "Une erreur est survenue."} />
        )}
      </div>
    </div>
  );
});

const ReasoningPartRenderer = memo(function ReasoningPartRenderer({
  part,
}: {
  part: { type: "reasoning"; text: string; state?: "streaming" | "done" };
}) {
  const isStreaming = part.state === "streaming";
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const [visibleText] = useSmoothText(part.text ?? "", {
    startStreaming: isStreaming,
  });
  const deferredText = useDeferredValue(visibleText);
  const processed = useMemo(
    () => preprocessTextWithNodeLinks(deferredText || "..."),
    [deferredText],
  );

  if (!visibleText && !isStreaming) {
    return null;
  }

  return (
    <div className="rounded border border-slate-300 bg-slate-50 text-xs text-slate-700">
      <button
        type="button"
        className="w-full flex items-center gap-1 px-2 py-1.5 text-left"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <TbBrain
          size={12}
          className={cn(isStreaming ? "animate-spin" : "opacity-70")}
        />
        <span>{isStreaming ? "Nole is thinking..." : "Thinking"}</span>
        <TbChevronDown
          size={12}
          className={cn(
            "ml-auto transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isExpanded ? (
        <div className="border-t border-slate-200 px-2 py-2 whitespace-pre-wrap overflow-x-auto">
          <MarkdownText components={markdownComponents}>
            {processed}
          </MarkdownText>
        </div>
      ) : null}
    </div>
  );
});

const ToolPlaceholder = memo(function ToolPlaceholder({
  state,
  name,
  error,
  input,
  output,
}: {
  state: ToolPartState;
  name: string;
  error?: string;
  input?: unknown;
  output?: unknown;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const label =
    state === "input-streaming"
      ? "Tool en cours d'execution"
      : state === "output-error"
        ? `Tool en erreur: ${name}`
        : `Tool execute: ${name}`;

  const hasDebugData = input !== undefined || output !== undefined || !!error;

  const nodeIdsInTool = useMemo(() => {
    const textToParse = `${JSON.stringify(input || {})} ${JSON.stringify(output || {})}`;
    return matchLlmIdsInText(textToParse);
  }, [input, output]);

  return (
    <div className="py-2 rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-700">
      <button
        type="button"
        className="w-full flex items-center gap-1 text-left"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <TbTool
          size={12}
          className={cn(state === "input-streaming" && "animate-pulse")}
        />
        <span>{label}</span>
        <TbChevronDown
          size={12}
          className={cn(
            "ml-auto transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {!isExpanded && nodeIdsInTool.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {nodeIdsInTool.map((id) => (
            <MentionedNodeCard key={id} nodeId={id} />
          ))}
        </div>
      )}

      {isExpanded && hasDebugData ? (
        <div className="mt-2 space-y-2 ">
          <DebugBlock label="Args" value={input} />
          <DebugBlock label="Result" value={output} />
          <DebugBlock label="Error" value={error} />
        </div>
      ) : null}
    </div>
  );
});

function DebugBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) {
    return null;
  }

  return (
    <div>
      <p className="mb-1 font-medium text-slate-800">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px] text-slate-700 border border-slate-200">
        {stringifyForDebug(value)}
      </pre>
    </div>
  );
}

function ErrorInline({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800",
        className,
      )}
    >
      <TbAlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
      <span>{message}</span>
    </div>
  );
}

function getMessageErrorText(message: UIMessage): string | undefined {
  const candidate = message as unknown as Record<string, unknown>;
  return readErrorLike(candidate.error);
}

function getToolPartErrorText(
  part: unknown,
  state: ToolPartState,
): string | undefined {
  if (!isRecord(part)) {
    return undefined;
  }

  const directError = readErrorLike(part.error);
  if (directError) {
    return directError;
  }

  if (state === "output-error") {
    return readErrorLike(part.output);
  }

  return undefined;
}

function readErrorLike(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readErrorLike(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const keys = [
    "error",
    "message",
    "detail",
    "details",
    "cause",
    "reason",
    "statusText",
  ];
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      const text = candidate.trim();
      return text.length > 200 ? text.slice(0, 200) + "…" : text;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyForDebug(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractUserMessageForDisplay(text: string): string {
  const match = /<user_message>\s*([\s\S]*?)\s*<\/user_message>/i.exec(text);
  if (!match) {
    return text;
  }

  return match[1] ?? text;
}

export const TextPartRenderer = memo(function TextPartRenderer({
  part,
}: {
  part: TextPart;
}) {
  const [visibleText] = useSmoothText(part.text ?? "", {
    startStreaming: part.state === "streaming",
  });
  const deferredText = useDeferredValue(visibleText);
  const processed = useMemo(
    () => preprocessTextWithNodeLinks(deferredText),
    [deferredText],
  );

  if (!visibleText) {
    return null;
  }

  return (
    <div className="whitespace-pre-wrap px-1 overflow-x-auto">
      <MarkdownText components={markdownComponents}>{processed}</MarkdownText>
    </div>
  );
});
