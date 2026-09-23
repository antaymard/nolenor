import { memo, useMemo, useState } from "react";
import { TbCheck, TbCopy } from "react-icons/tb";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import { cn } from "@/lib/utils";
import { stringifyForDebug } from "../messageParsing";
import type { ToolStep } from "./activityModel";

/** Au-delà, le `<pre>` ne montre qu'un début : la copie, elle, reste entière. */
const MAX_PREVIEW_CHARS = 20_000;

type Tab = "input" | "output";

/**
 * Tiroir de debug d'un tool call : nom technique, état SDK, erreur,
 * nodes cités, et la charge brute (args / résultat) copiable.
 *
 * Monté seulement une fois déplié : sérialiser la sortie d'un `read_nodes`
 * n'a rien de gratuit, et on ne le paie que quand quelqu'un regarde.
 */
export const ToolStepDetails = memo(function ToolStepDetails({
  step,
}: {
  step: ToolStep;
}) {
  const hasOutput = step.output !== undefined;
  const [tab, setTab] = useState<Tab>(hasOutput ? "output" : "input");
  const activeTab: Tab = tab === "output" && !hasOutput ? "input" : tab;

  const payload = activeTab === "input" ? step.input : step.output;
  const fullText = useMemo(
    () => (payload === undefined ? "" : stringifyForDebug(payload)),
    [payload],
  );
  const isTruncated = fullText.length > MAX_PREVIEW_CHARS;

  return (
    <div className="mt-1 mb-2 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70 text-[11px] animate-appear">
      <div className="flex min-w-0 items-center gap-2 border-b border-slate-200 px-2 py-1 text-slate-500">
        <code className="font-mono font-medium text-slate-700">{step.name}</code>
        <span className="rounded bg-slate-200/70 px-1 font-mono">{step.state}</span>
      </div>

      {step.error && (
        <div className="border-b border-red-100 bg-red-50 px-2 py-1.5 whitespace-pre-wrap text-red-700">
          {step.error}
        </div>
      )}

      {step.nodeIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-2 py-1.5">
          {step.nodeIds.map((id) => (
            <MentionedNodeCard key={id} nodeId={id} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-0.5 px-1 pt-1">
        <TabButton
          active={activeTab === "input"}
          disabled={step.input === undefined}
          onClick={() => setTab("input")}
        >
          Input
        </TabButton>
        <TabButton
          active={activeTab === "output"}
          disabled={!hasOutput}
          onClick={() => setTab("output")}
        >
          Output
        </TabButton>
        {fullText && <CopyButton value={fullText} />}
      </div>

      <pre className="max-h-64 overflow-auto px-2 py-1.5 font-mono whitespace-pre-wrap break-all text-slate-600">
        {fullText
          ? isTruncated
            ? `${fullText.slice(0, MAX_PREVIEW_CHARS)}\n… (truncated — copy to get everything)`
            : fullText
          : "—"}
      </pre>
    </div>
  );
});

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 font-medium transition-colors",
        active
          ? "bg-white text-slate-700 shadow-[0_0_0_1px_rgb(226_232_240)]"
          : "text-slate-400 hover:text-slate-600",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-400 transition-colors hover:text-slate-700"
      aria-label="Copy"
    >
      {copied ? (
        <TbCheck size={12} className="text-emerald-500" />
      ) : (
        <TbCopy size={12} />
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
