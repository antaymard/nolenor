import { TbX } from "react-icons/tb";
import DateAbsoluteView from "@/components/fields/views/date/AbsoluteView";
import type { FieldTriggerRenderer } from "@/components/fields/fieldHostTypes";

// Seule vue de tout le catalogue V1 dont l'état "fermé" porte une action de
// mutation (bouton clear) — cf. commentaire sur FieldTriggerRenderer. Le
// clic sur le bouton stoppe la propagation pour ne pas rouvrir le popover
// via le onClick du trigger englobant (PopoverShell).
const DateAbsoluteTrigger: FieldTriggerRenderer = (props) => {
  const hasValue = typeof props.value === "string" && props.value.length > 0;

  return (
    <span className="flex items-center gap-1 w-full min-w-0">
      <DateAbsoluteView {...props} />
      {hasValue && (
        <button
          type="button"
          className="ml-auto shrink-0 opacity-40 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            props.onCommit(null);
          }}
        >
          <TbX size={12} />
        </button>
      )}
    </span>
  );
};

export default DateAbsoluteTrigger;
