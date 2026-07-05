import { TbAlertCircle } from "react-icons/tb";
import { cn } from "@/lib/utils";

/** Inline red error banner shown inside a failed assistant message. */
export function ErrorInline({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive",
        className,
      )}
    >
      <TbAlertCircle size={14} className="mt-0.5 shrink-0 text-destructive" />
      <span>{message}</span>
    </div>
  );
}
