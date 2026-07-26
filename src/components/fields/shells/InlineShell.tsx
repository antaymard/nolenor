import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  FieldEditorComponent,
  FieldViewComponent,
  FieldViewProps,
} from "@/components/fields/fieldHostTypes";

type InlineShellProps = FieldViewProps & {
  View: FieldViewComponent;
  Editor: FieldEditorComponent;
  onCommit?: (value: unknown) => void;
  // "toggle" : clic pour éditer (span → input), comme les cellules texte des
  // tables — vue et édition sont deux rendus distincts, un seul visible à la
  // fois (short_text, number).
  // "direct" : l'éditeur est monté en permanence dès qu'il y a un onCommit,
  // sans état "édition" séparé — c'est un contrôle à manipulation directe
  // (checkbox, upload d'image), pas un texte qu'on bascule en input.
  mode: "toggle" | "direct";
};

export default function InlineShell({
  View,
  Editor,
  onCommit,
  mode,
  ...viewProps
}: InlineShellProps) {
  const [editing, setEditing] = useState(false);

  if (!onCommit) {
    return <View {...viewProps} />;
  }

  if (mode === "direct") {
    return <Editor {...viewProps} commit={onCommit} cancel={() => {}} />;
  }

  if (editing) {
    return (
      <Editor
        {...viewProps}
        commit={(value) => {
          onCommit(value);
          setEditing(false);
        }}
        cancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className={cn("nodrag cursor-text rounded hover:bg-black/5")}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <View {...viewProps} />
    </div>
  );
}
