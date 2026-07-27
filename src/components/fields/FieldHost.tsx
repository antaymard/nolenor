import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { LayoutFieldPlacement } from "@/../convex/config/templateConfig";
import {
  parseVariantOptions,
  resolveFieldVariant,
  type FieldSurface,
} from "@/../convex/config/fieldVariants";
import { fieldRegistry } from "@/components/fields/registry/fieldRegistry";
import StaticShell from "@/components/fields/shells/StaticShell";
import InlineShell from "@/components/fields/shells/InlineShell";
import PopoverShell from "@/components/fields/shells/PopoverShell";
import WindowEscalationShell from "@/components/fields/shells/WindowEscalationShell";

type FieldHostProps = {
  field: TemplateField;
  value: unknown;
  surface: FieldSurface;
  placement: LayoutFieldPlacement;
  onCommit?: (value: unknown) => void;
  onEscalate?: () => void;
};

// Point d'intégration unique entre LayoutRenderer et le registry de champs :
// résout le variant (jamais confiance aveugle dans placement.variant — un
// id enregistré peut avoir disparu du catalogue depuis, cf.
// resolveFieldVariant), résout ses options, rend le label, puis délègue au
// shell déclaré par le registry pour CE variant. Ajouter un variant = une
// entrée dans fieldRegistry, jamais une nouvelle branche ici.
export default function FieldHost({
  field,
  value,
  surface,
  placement,
  onCommit,
  onEscalate,
}: FieldHostProps) {
  const entry = fieldRegistry[field.type];
  const resolved = resolveFieldVariant(field.type, surface, placement.variant);
  const registration = entry.variants[resolved.id];

  // Ne devrait jamais arriver (le registry et le catalogue fieldVariants
  // sont censés rester en phase, `satisfies` le vérifie à la compilation) :
  // dégrade en silence plutôt que de planter le rendu de tout le node.
  if (!registration) return null;

  const showLabel = placement.showLabel === true;
  const options = parseVariantOptions(resolved, placement.variantOptions);
  const common = { field, value, surface, options, showLabel };

  // Le label est rendu ici et non par LayoutRenderer : seul cet endroit
  // connaît le variant résolu, donc sait si celui-ci affiche le label
  // lui-même (ownsLabel). `showLabel` est transmis à la vue dans les deux
  // cas — cf. commentaire dans fieldHostTypes.
  const label =
    showLabel && !resolved.ownsLabel ? (
      <div className="text-[11px] font-medium text-muted-foreground mb-0.5 truncate">
        {field.name}
      </div>
    ) : null;

  const body = (() => {
    switch (registration.shell) {
      case "static":
        return <StaticShell View={registration.View} {...common} />;
      case "inline":
        return (
          <InlineShell
            View={registration.View}
            Editor={registration.Editor}
            mode={registration.mode}
            onCommit={onCommit}
            {...common}
          />
        );
      case "popover":
        return (
          <PopoverShell
            View={registration.View}
            Editor={registration.Editor}
            renderTrigger={registration.renderTrigger}
            onCommit={onCommit}
            {...common}
          />
        );
      case "window":
        return (
          <WindowEscalationShell
            View={registration.View}
            onCommit={onCommit}
            onEscalate={onEscalate}
            {...common}
          />
        );
      case "custom": {
        const { Component } = registration;
        return (
          <Component {...common} onCommit={onCommit} onEscalate={onEscalate} />
        );
      }
      default: {
        const exhaustive: never = registration;
        return exhaustive;
      }
    }
  })();

  return (
    <>
      {label}
      {body}
    </>
  );
}
