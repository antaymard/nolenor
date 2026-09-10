import { memo } from "react";
import { TbArrowUp, TbPencil } from "react-icons/tb";

type EmptyAction = "double-click" | "pencil" | "none";

interface NodeEmptyStateProps {
  icon: React.ReactNode;
  /** Ligne principale, ex. "No image". Optionnelle pour les CTA
   *  double-clic historiques (blocknote/table) qui n'affichent que l'action. */
  title?: string;
  action: EmptyAction;
  /** Sous-texte libre (ex. AppNode vide), affiché à la place du CTA
   *  quand action="none", en dessous sinon. */
  hint?: string;
  /** Ligne unique pour les nodes compacts (~33px : link, pdf, value...). */
  compact?: boolean;
}

function PencilCta() {
  return (
    <span className="flex items-center gap-1 text-xs">
      <span>Click</span>
      <TbPencil size={12} className="shrink-0" />
      <span>above</span>
      <TbArrowUp size={12} className="shrink-0" />
    </span>
  );
}

function NodeEmptyState({ icon, title, action, hint, compact = false }: NodeEmptyStateProps) {
  const cta =
    action === "double-click" ? (
      <span className="text-xs truncate">Double click to edit</span>
    ) : action === "pencil" ? (
      <PencilCta />
    ) : null;
  if (compact) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1.5 px-2 text-muted-foreground select-none pointer-events-none min-w-0">
        <span className="shrink-0">{icon}</span>
        {title && <span className="text-xs truncate">{title}</span>}
        {cta}
        {hint && <span className="text-xs truncate">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center text-muted-foreground select-none pointer-events-none">
      {icon}
      {title && <span className="text-sm">{title}</span>}
      {cta}
      {hint && <span className="text-xs">{hint}</span>}
    </div>
  );
}

export default memo(NodeEmptyState);
