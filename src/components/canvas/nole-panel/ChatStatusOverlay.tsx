import type { ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { TbAlertCircle, TbCheck } from "react-icons/tb";
import { cn } from "@/lib/utils";

type ChatStatusOverlayProps = {
  showThinking: boolean;
  /** True while streaming, false while only waiting for the response to start. */
  isThinking: boolean;
  showDone: boolean;
  isFailed: boolean;
  onRetry?: () => void;
};

/**
 * Bottom-of-list overlay showing the assistant's transient status: thinking /
 * waiting, a brief "Done" flash, or a failure banner with a retry action.
 */
export default function ChatStatusOverlay({
  showThinking,
  isThinking,
  showDone,
  isFailed,
  onRetry,
}: ChatStatusOverlayProps) {
  if (!showThinking && !showDone && !isFailed) return null;

  return (
    <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 flex justify-center pb-2">
      {showThinking && (
        <ThinkingIndicator
          // L'orbe nomme ce que fait l'assistant : elle tourne pendant qu'il
          // rédige, elle respire tant qu'on attend encore le premier token.
          state={isThinking ? "working" : "breathing"}
          label={isThinking ? "Nolë is thinking..." : "Waiting for response..."}
        />
      )}
      {showDone && !showThinking && <DoneIndicator />}
      {isFailed && !showThinking && <FailedIndicator onRetry={onRetry} />}
    </div>
  );
}

/** Pastille flottante commune aux trois états, posée au-dessus de la liste. */
function StatusPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-appear-up flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-2",
        "text-xs shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ThinkingIndicator({
  state,
  label,
}: {
  state: "working" | "breathing";
  label: string;
}) {
  return (
    <StatusPill className="border-slate-200 bg-white/85 text-slate-500">
      {/* Le texte à côté porte déjà l'information : l'orbe est décorative. */}
      <ThinkingOrb state={state} size={20} aria-hidden />
      <span>{label}</span>
    </StatusPill>
  );
}

function DoneIndicator() {
  return (
    <StatusPill className="border-emerald-200 bg-emerald-50/90 text-emerald-700">
      <TbCheck size={14} className="mx-[3px] shrink-0" />
      <span>Done</span>
    </StatusPill>
  );
}

function FailedIndicator({ onRetry }: { onRetry?: () => void }) {
  return (
    <StatusPill className="pointer-events-auto mx-3 border-red-200 bg-red-50/95 text-red-700">
      <TbAlertCircle size={14} className="mx-[3px] shrink-0 text-red-500" />
      <span>La réponse a échoué.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-2 hover:text-red-900"
        >
          Réessayer
        </button>
      )}
    </StatusPill>
  );
}
