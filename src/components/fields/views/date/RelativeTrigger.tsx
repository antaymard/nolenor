import DateRelativeView from "@/components/fields/views/date/RelativeView";
import DateClearButton from "@/components/fields/views/date/DateClearButton";
import type { FieldTriggerRenderer } from "@/components/fields/fieldHostTypes";

const DateRelativeTrigger: FieldTriggerRenderer = (props) => {
  const hasValue = typeof props.value === "string" && props.value.length > 0;

  return (
    <span className="flex items-center gap-1 w-full min-w-0">
      <DateRelativeView {...props} />
      {hasValue && <DateClearButton onClear={() => props.onCommit(null)} />}
    </span>
  );
};

export default DateRelativeTrigger;
