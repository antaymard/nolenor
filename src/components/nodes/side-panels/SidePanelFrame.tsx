import { useNodeSidePanel } from "./NodeSidePanelContext";
import { HiMiniXMark } from "react-icons/hi2";

export default function SidePanelFrame({
  children,
  id,
  title,
  className = "",
}: {
  children: React.ReactNode;
  id: string;
  title: string;
  className?: string;
}) {
  const { closeSidePanel } = useNodeSidePanel();

  return (
    <div
      className={
        "space-y-2 rounded border bg-card mb-2 shadow-xl ring-2 " +
        className
      }
    >
      <div className="flex items-center justify-between p-2 pb-0 gap-5">
        <h3 className="font-semibold">{title}</h3>
        <button
          className="hover:bg-accent/60 rounded-xs aspect-square"
          type="button"
          onClick={() => closeSidePanel(id)}
        >
          <HiMiniXMark size={18} />
        </button>
      </div>
      <div className="p-2 space-y-2">{children}</div>
    </div>
  );
}
