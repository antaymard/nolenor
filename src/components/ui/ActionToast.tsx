import type { CSSProperties } from "react";
import toast, { type ToastPosition } from "react-hot-toast";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

/**
 * L'habillage commun à tous les toasts : ceux de react-hot-toast
 * (`toast.success`, `toast.error`… via `toastOptions` du `<Toaster />`) comme
 * ceux à action ci-dessous, rendus en `toast.custom`. En style inline parce
 * que la barre de react-hot-toast pose le sien inline, qu'une classe ne
 * surcharge pas.
 */
export const TOAST_STYLE: CSSProperties = {
  borderRadius: "calc(var(--radius) + 4px)",
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 14,
  lineHeight: "20px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
  maxWidth: "min(26rem, calc(100vw - 2rem))",
};

type ActionToastOptions = {
  message: string;
  actionLabel: string;
  onAction: () => void;
  id?: string;
  duration?: number;
  position?: ToastPosition;
};

/**
 * Un toast avec un bouton : « Undo », « Reload »… Le libellé passe sur deux
 * lignes au besoin, puis s'ellipse ; le bouton, lui, ne rétrécit jamais — un
 * titre de tâche trop long le poussait hors du toast.
 *
 * Le clic referme le toast avant de lancer l'action.
 */
export function showActionToast({
  message,
  actionLabel,
  onAction,
  ...options
}: ActionToastOptions): string {
  return toast.custom(
    (t) => (
      <div
        style={TOAST_STYLE}
        className={cn(
          "flex items-center gap-3 py-2 pr-2 pl-4",
          t.visible
            ? "animate-in fade-in-0 zoom-in-95"
            : "animate-out fade-out-0 zoom-out-95 fill-mode-forwards",
        )}
        role="status"
        aria-live="polite"
      >
        <span className="line-clamp-2 min-w-0 flex-1 break-words">
          {message}
        </span>
        <Button
          size="sm"
          className="shrink-0 font-semibold"
          onClick={() => {
            toast.dismiss(t.id);
            onAction();
          }}
        >
          {actionLabel}
        </Button>
      </div>
    ),
    options,
  );
}
