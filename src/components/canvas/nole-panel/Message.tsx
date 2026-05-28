import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { memo, useDeferredValue, useState, useMemo } from "react";
import { MarkdownText } from "@/components/ai/MarkdownText";
import type { TextPart } from "@/types/domain/message.types";
import { RiLoaderLine } from "react-icons/ri";
import { cn } from "@/lib/utils";
import {
  TbAlertCircle,
  TbBrain,
  TbChevronDown,
  TbLink,
  TbTool,
} from "react-icons/tb";
import { LuMousePointerClick } from "react-icons/lu";
import { buildLlmIdTextRegex, matchLlmIdsInText } from "@/../convex/lib/llmId";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import type { Components } from "react-markdown";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";
import { getModelLabel } from "@/lib/getModelLabel";
import { extractUserMessageForDisplay } from "./chatHelpers";

type ToolPartState = "input-streaming" | "output-available" | "output-error";

function preprocessTextWithNodeLinks(text: string): string {
  if (!text) return "";
  // Reprend exactement la même regex que matchLlmIdsInText pour garantir
  // que tout ce qui est transformé en lien correspond à un format de node ID valide.
  return text.replace(
    buildLlmIdTextRegex(),
    (match) => `[${match}](#node-${match})`,
  );
}

const markdownComponents: Components = {
  a: ({ href, children }) => {
    if (href?.startsWith("#node-")) {
      const nodeId = href.replace("#node-", "");
      // children = le texte d'origine, utilisé en fallback si aucun node ne matche.
      return <MentionedNodeCard nodeId={nodeId} inline fallback={children} />;
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
  metadata,
  modelOptions,
}: {
  message: UIMessage;
  metadata?: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  const isUser = message.role === "user";
  const userText = extractUserMessageForDisplay(message.text ?? "");

  // Pour les messages utilisateur, afficher simplement le texte
  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="rounded whitespace-pre-wrap p-3 bg-slate-200 border border-slate-400 text-text max-w-4/5">
          <MarkdownText>{userText}</MarkdownText>
        </div>
        {metadata?.attachments ? (
          <UserMessageAttachments attachments={metadata.attachments} />
        ) : null}
      </div>
    );
  }

  // Pour les messages assistant, iterer sur les parts
  const parts = message.parts ?? [];
  const isProcessing = message.status === "streaming";
  const messageError = getMessageErrorText(message);

  return (
    <div className="flex justify-start group">
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

        {!isProcessing && metadata && metadata.model ? (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <AssistantMessageFooter
              metadata={metadata}
              modelOptions={modelOptions}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
});

function UserMessageAttachments({
  attachments,
}: {
  attachments: NonNullable<Doc<"messageMetadata">["attachments"]>;
}) {
  const nodes = attachments.nodes ?? [];
  const hasAny =
    nodes.length > 0 || !!attachments.position || !!attachments.page;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-1 max-w-4/5 justify-end">
      {nodes.map((n) => (
        <MentionedNodeCard key={n.id} nodeId={n.id} fallback={n.title} />
      ))}
      {attachments.position ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600">
          <LuMousePointerClick size={11} />({Math.round(attachments.position.x)}
          , {Math.round(attachments.position.y)})
        </span>
      ) : null}
      {attachments.page && (attachments.page.title || attachments.page.url) ? (
        <a
          href={attachments.page.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 max-w-55"
        >
          <TbLink size={11} className="shrink-0" />
          <span className="truncate">
            {attachments.page.title ?? attachments.page.url}
          </span>
        </a>
      ) : null}
    </div>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCostUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function AssistantMessageFooter({
  metadata,
  modelOptions,
}: {
  metadata: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  const modelLabel = getModelLabel(metadata.model, modelOptions);
  const tokens = metadata.usage?.totalTokens;
  const cost = metadata.costUsd;
  const parts: string[] = [];
  if (tokens !== undefined) parts.push(`${formatTokenCount(tokens)} tk`);
  if (cost !== undefined && cost > 0) parts.push(formatCostUsd(cost));

  return (
    <div className="flex items-center gap-1 px-1 text-[10px] text-slate-400">
      <TbBrain size={10} />
      <span>{modelLabel}</span>
      {parts.length > 0 && <span>· {parts.join(" · ")}</span>}
    </div>
  );
}

const ReasoningPartRenderer = memo(function ReasoningPartRenderer({
  part,
}: {
  part: { type: "reasoning"; text: string; state?: "streaming" | "done" };
}) {
  const isStreaming = part.state === "streaming";
  const [isExpanded, setIsExpanded] = useState(false);
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
  const explanation = getToolExplanation(input);
  const primaryLabel = explanation ?? getToolFallbackLabel(state, name);
  const primaryLabelClassName = cn(
    "truncate text-sm",
    state === "output-error" ? "text-red-700" : "text-slate-800",
  );
  const secondaryLabelClassName = cn(
    "font-mono text-[11px]",
    state === "output-error" ? "text-red-500" : "text-slate-500",
  );

  const hasDebugData = input !== undefined || output !== undefined || !!error;

  const nodeIdsInTool = useMemo(() => {
    const textToParse = `${JSON.stringify(input || {})} ${JSON.stringify(output || {})}`;
    return matchLlmIdsInText(textToParse);
  }, [input, output]);

  return (
    <div className="py-2 rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-700">
      <button
        type="button"
        className="w-full flex items-start gap-2 text-left"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        {state === "input-streaming" ? (
          <RiLoaderLine
            size={14}
            className="mt-0.5 shrink-0 animate-spin text-slate-400"
          />
        ) : state === "output-error" ? (
          <TbAlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
        ) : (
          <TbTool size={14} className="mt-0.5 shrink-0 text-slate-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className={primaryLabelClassName}>{primaryLabel}</div>
          <div className={secondaryLabelClassName}>{name}</div>
        </div>
        <TbChevronDown
          size={12}
          className={cn(
            "mt-0.5 ml-auto shrink-0 transition-transform",
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

function getToolExplanation(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.explanation !== "string") {
    return undefined;
  }

  const explanation = input.explanation.trim();
  return explanation || undefined;
}

function getToolFallbackLabel(state: ToolPartState, name: string): string {
  if (state === "input-streaming") {
    return `Tool en cours: ${name}`;
  }

  if (state === "output-error") {
    return `Tool en erreur: ${name}`;
  }

  return `Tool execute: ${name}`;
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
