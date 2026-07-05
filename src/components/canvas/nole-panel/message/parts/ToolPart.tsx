import { memo, useMemo, useState } from "react";
import { RiLoaderLine } from "react-icons/ri";
import { TbAlertCircle, TbChevronDown, TbTool } from "react-icons/tb";
import { matchLlmIdsInText } from "@/../convex/lib/llmId";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import { cn } from "@/lib/utils";
import {
  getToolExplanation,
  getToolFallbackLabel,
  stringifyForDebug,
  type ToolPartState,
} from "../messageParsing";

type ToolPartProps = {
  state: ToolPartState;
  name: string;
  error?: string;
  input?: unknown;
  output?: unknown;
};

/**
 * Generic collapsible card for any `tool-*` part: shows a status icon, the
 * tool's explanation (or a fallback label), clickable cards for any node IDs
 * referenced, and the raw args/result/error when expanded.
 */
export const ToolPart = memo(function ToolPart({
  state,
  name,
  error,
  input,
  output,
}: ToolPartProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const primaryLabel = getToolExplanation(input) ?? getToolFallbackLabel(state, name);
  const isError = state === "output-error";
  const hasDebugData = input !== undefined || output !== undefined || !!error;

  const referencedNodeIds = useMemo(() => {
    const text = `${JSON.stringify(input ?? {})} ${JSON.stringify(output ?? {})}`;
    return matchLlmIdsInText(text);
  }, [input, output]);

  return (
    <div className="py-2 rounded border border-border bg-muted/50 p-2 text-xs text-foreground">
      <button
        type="button"
        className="w-full flex items-start gap-2 text-left"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <ToolStatusIcon state={state} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-sm",
              isError ? "text-destructive" : "text-foreground",
            )}
          >
            {primaryLabel}
          </div>
          <div
            className={cn(
              "font-mono text-[11px]",
              isError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {name}
          </div>
        </div>
        <TbChevronDown
          size={12}
          className={cn(
            "mt-0.5 ml-auto shrink-0 transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {!isExpanded && referencedNodeIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {referencedNodeIds.map((id) => (
            <MentionedNodeCard key={id} nodeId={id} />
          ))}
        </div>
      )}

      {isExpanded && hasDebugData ? (
        <div className="mt-2 space-y-2">
          <DebugBlock label="Args" value={input} />
          <DebugBlock label="Result" value={output} />
          <DebugBlock label="Error" value={error} />
        </div>
      ) : null}
    </div>
  );
});

function ToolStatusIcon({ state }: { state: ToolPartState }) {
  if (state === "input-streaming") {
    return (
      <RiLoaderLine size={14} className="mt-0.5 shrink-0 animate-spin text-muted-foreground/70" />
    );
  }
  if (state === "output-error") {
    return <TbAlertCircle size={14} className="mt-0.5 shrink-0 text-destructive" />;
  }
  return <TbTool size={14} className="mt-0.5 shrink-0 text-muted-foreground" />;
}

function DebugBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;

  return (
    <div>
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-card p-2 text-[11px] text-foreground border border-border">
        {stringifyForDebug(value)}
      </pre>
    </div>
  );
}
