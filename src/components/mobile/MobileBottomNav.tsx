import { TbLayoutBoardSplit, TbMessageCircle, TbSearch } from "react-icons/tb";
import type { IconType } from "react-icons";
import { cn } from "@/lib/utils";
import type { MobileTab } from "./mobileShellContext";

const TABS: Array<{ id: MobileTab; label: string; Icon: IconType }> = [
  { id: "chat", label: "Chat", Icon: TbMessageCircle },
  { id: "search", label: "Recherche", Icon: TbSearch },
  { id: "canvas", label: "Canvas", Icon: TbLayoutBoardSplit },
];

export default function MobileBottomNav({
  active,
  onChange,
}: {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Navigation principale"
      className="flex shrink-0 border-t bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
              isActive ? "text-slate-900" : "text-slate-400",
            )}
          >
            <Icon size={20} className={cn(isActive && "stroke-[2.2]")} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
