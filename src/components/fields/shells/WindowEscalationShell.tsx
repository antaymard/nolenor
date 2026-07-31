import type {
  FieldViewComponent,
  FieldViewProps,
} from "@/components/fields/fieldHostTypes";

type WindowEscalationShellProps = FieldViewProps & {
  View: FieldViewComponent;
  onCommit?: (value: unknown) => void;
  onEscalate?: () => void;
};

// edit:"window" : un clic ouvre la window plutôt que de monter un éditeur sur
// le canvas — jamais d'édition inline pour ce mode, par construction ("jamais
// d'éditeur riche monté dans un node canvas"). Seul utilisateur aujourd'hui :
// rich_text.link, node-only par déclaration (un variant edit:"window"
// autorisé sur la surface window serait une auto-escalade, refusée par les
// assertions du catalogue).
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
