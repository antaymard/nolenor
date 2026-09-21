import { TbListDetails } from "react-icons/tb";

export function PlanTabPlaceholder({
  message = "Nothing to show for this node type.",
}: {
  message?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <TbListDetails className="size-6 text-slate-300" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}
