import { RiLoaderLine } from "react-icons/ri";
import { TbAlertCircle, TbCheck } from "react-icons/tb";

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
    <div className="absolute left-0 right-0 bottom-0 flex justify-center z-20 pb-2">
      {showThinking && (
        <div className="pointer-events-none">
          <ThinkingIndicator
            label={isThinking ? "Nole is thinking..." : "Waiting for response..."}
          />
        </div>
      )}
      {showDone && !showThinking && (
        <div className="pointer-events-none">
          <DoneIndicator />
        </div>
      )}
      {isFailed && !showThinking && <FailedIndicator onRetry={onRetry} />}
    </div>
  );
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1">
      <RiLoaderLine size={14} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function DoneIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-emerald-500 px-2 py-1">
      <TbCheck size={14} />
      <span>Done</span>
    </div>
  );
}

function FailedIndicator({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1 mx-3">
      <TbAlertCircle size={14} className="shrink-0" />
      <span className="flex-1">La réponse a échoué.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="underline text-destructive hover:text-destructive/80 font-medium"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
