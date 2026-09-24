import { TbChevronDown } from "react-icons/tb";
import { cn } from "@/lib/utils";

/**
 * Une section repliable des réglages d'un canvas (modale create/edit et
 * Settings › Canvas) : un titre cliquable, un résumé optionnel, et son contenu.
 */
export default function CollapsibleSection({
  title,
  summary,
  className,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Rappel à droite du titre quand la section est repliée (ex. « Set »). */
  summary?: string;
  className?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border border-gray-200", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-medium">
          {title}
          {summary && (
            <span className="ml-2 font-normal text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        <TbChevronDown
          size={16}
          className={cn(
            "shrink-0 text-gray-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-2 border-t border-gray-200 p-3">{children}</div>
      )}
    </div>
  );
}
