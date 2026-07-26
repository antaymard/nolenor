import type {
  FieldViewComponent,
  FieldViewProps,
} from "@/components/fields/fieldHostTypes";

type WindowEscalationShellProps = FieldViewProps & {
  View: FieldViewComponent;
  onCommit?: (value: unknown) => void;
  onEscalate?: () => void;
};

// edit:"window" : aucun variant du catalogue actuel ne l'utilise encore
// (Phase 4/5 en ajoutera, ex. un futur rich_text "excerpt" cliquable). Un
// clic ouvre la window plutôt que de monter un éditeur sur le canvas —
// jamais d'édition inline pour ce mode, par construction (cf. plan :
// "jamais d'éditeur riche monté dans un node canvas").
export default function WindowEscalationShell({
  View,
  onCommit,
  onEscalate,
  ...viewProps
}: WindowEscalationShellProps) {
  const canEscalate = Boolean(onCommit) && Boolean(onEscalate);

  if (!canEscalate) {
    // Dégrade proprement : vue statique sans action de clic (template sans
    // windowLayout, champ absent de la window, permission lecture seule) —
    // jamais une window vide ouverte dans le vide.
    return <View {...viewProps} />;
  }

  return (
    <div
      className="nodrag cursor-pointer rounded hover:bg-black/5"
      onClick={(e) => {
        e.stopPropagation();
        onEscalate?.();
      }}
    >
      <View {...viewProps} />
    </div>
  );
}
