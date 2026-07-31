import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";
import { shortTextPlaceholder } from "@/components/fields/shared/shortTextFormat";

export default function ShortTextEditor({
  field,
  value,
  commit,
  cancel,
}: FieldEditorProps) {
  const text = typeof value === "string" ? value : "";

  return (
    <input
      autoFocus
      type="text"
      defaultValue={text}
      placeholder={shortTextPlaceholder(field)}
      className="nodrag w-full min-w-0 bg-transparent border-b border-blue-300 outline-none text-sm py-0.5"
      onBlur={(e) => {
        if (e.target.value !== text) commit(e.target.value);
        else cancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") cancel();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
