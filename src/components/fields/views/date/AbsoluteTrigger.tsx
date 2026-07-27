import DateAbsoluteView from "@/components/fields/views/date/AbsoluteView";
import DateClearButton from "@/components/fields/views/date/DateClearButton";
import type { FieldTriggerRenderer } from "@/components/fields/fieldHostTypes";

// Les deux variants de date ont un état fermé qui porte une action de
// mutation (clear) — donc pas une vue pure, d'où le renderTrigger dédié
// (cf. FieldTriggerRenderer).
const DateAbsoluteTrigger: FieldTriggerRenderer = (props) => {
  const hasValue = typeof props.value === "string" && props.value.length > 0;

  return (
    <span className="flex items-center gap-1 w-full min-w-0">
      <DateAbsoluteView {...props} />
      {hasValue && <DateClearButton onClear={() => props.onCommit(null)} />}
    </span>
  );
};

export default DateAbsoluteTrigger;
