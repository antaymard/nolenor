import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import type {
  FieldEditorComponent,
  FieldTriggerRenderer,
  FieldViewComponent,
  FieldViewProps,
} from "@/components/fields/fieldHostTypes";

type PopoverShellProps = FieldViewProps & {
  View: FieldViewComponent;
  Editor: FieldEditorComponent;
  onCommit?: (value: unknown) => void;
  // Par défaut le contenu fermé du popover est `<View />`. À fournir
  // seulement si ce contenu porte lui-même une action de mutation légère
  // (ex. date : bouton clear) — le seul cas où ce n'est pas une vue pure.
  renderTrigger?: FieldTriggerRenderer;
};

// edit:"popover" : la vue reste affichée en permanence, un clic ouvre un
// popover contenant l'éditeur. L'éditeur décide lui-même QUAND fermer
// (cancel()) — certains variants committent et ferment dans le même geste
// (date : sélectionner une date), d'autres committent à répétition sans
// fermer (un futur select multi resterait ouvert tant qu'on coche des
// options, ne fermant qu'au blur — cf. `select` aujourd'hui, qui reste
// "custom" car son popover est déjà géré par SelectCellEditor, partagé avec
// les tables : lui en superposer un second serait un doublon, pas une
// généralisation).
export default function PopoverShell({
  View,
  Editor,
  onCommit,
  renderTrigger,
  ...viewProps
}: PopoverShellProps) {
  const [open, setOpen] = useState(false);

  if (!onCommit) {
    return <View {...viewProps} />;
  }

  const triggerContent = renderTrigger ? (
    renderTrigger({ ...viewProps, onCommit })
  ) : (
    <View {...viewProps} />
  );

  const trigger = (
    <div
      className="nodrag cursor-pointer rounded hover:bg-black/5"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      {triggerContent}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="nodrag w-auto p-0" align="start">
        <Editor {...viewProps} commit={onCommit} cancel={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
