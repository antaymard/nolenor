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
        "flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800",
        className,
      )}
    >
      <TbAlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
      <span>{message}</span>
    </div>
  );
}
