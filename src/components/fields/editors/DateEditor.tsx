import { Calendar } from "@/components/shadcn/calendar";
import { parseIsoDate, toIsoDate } from "@/components/fields/shared/dateFormat";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

export default function DateEditor({ value, commit, cancel }: FieldEditorProps) {
  const dateValue = parseIsoDate(value);

  return (
    <Calendar
      mode="single"
      selected={dateValue}
      onSelect={(date) => {
        if (date) commit(toIsoDate(date));
        cancel();
      }}
    />
  );
}
