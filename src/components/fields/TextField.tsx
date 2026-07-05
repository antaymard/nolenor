import { useCallback } from "react";
import type { BaseFieldProps } from "@/types/ui";
import InlineEditableText from "../form-ui/InlineEditableText";
import { cn } from "@/lib/utils";

// TextField component pour le type "short_text"
// Toujours éditable, avec ou sans sauvegarde selon si onChange est fourni
function TextField({ field, value, onChange, visualSettings }: BaseFieldProps) {
  const handleSave = useCallback(
    (newValue: string) => {
      if (onChange) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  const showLabel = visualSettings?.showLabel as boolean | undefined;
  const displayAs = (visualSettings?.displayAs as string) || "p";
  const textValue = (value as string) || "";
  const placeholder =
    (field.options?.placeholder as string) || `${field?.name}...`;

  return (
    <div className="space-y-1">
      {showLabel && (
        <label className="text-xs font-medium text-muted-foreground">
          {field.name}
        </label>
      )}
      <InlineEditableText
        value={textValue}
        onSave={handleSave}
        placeholder={placeholder}
        className={cn(
          "w-full border border-transparent hover:border-border rounded-sm py-1",
          getTextClassName(displayAs)
        )}
        inputClassName="hover:ring-1 focus:ring-2 focus:ring-accent-foreground rounded-xs w-full"
      />
    </div>
  );
}

// Helper pour obtenir les classes CSS selon le displayAs
function getTextClassName(displayAs: string): string {
  switch (displayAs) {
    case "h1":
      return "text-2xl font-semibold";
    case "h2":
      return "text-xl font-semibold";
    case "h3":
      return "text-lg font-semibold";
    case "p":
    default:
      return "text-base";
  }
}

export default TextField;
