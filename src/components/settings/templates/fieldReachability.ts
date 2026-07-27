import {
  collectLayoutPlacements,
  type LayoutContainer,
} from "@/../convex/config/templateConfig";
import { resolveFieldVariant } from "@/../convex/config/fieldVariants";
import type { TemplateField } from "@/../convex/config/fieldConfig";

// « Ce champ est-il éditable quelque part ? » — avertissement du builder, pas
// une erreur : un champ non éditable est un choix légitime (donnée écrite par
// l'agent, badge indicatif), mais c'est le plus souvent un oubli, et rien ne
// le signalait.
//
// Les trois façons de rendre un champ inatteignable :
//   1. absent des deux arbres (data-only, l'utilisateur ne le voit même pas) ;
//   2. tous ses placements résolvent en edit:"none" ;
//   3. son seul placement éditable est un edit:"window" alors que le template
//      n'a pas de windowLayout, ou que le champ n'y est pas placé — l'escalade
//      n'a alors nulle part où aller (le shell dégrade en vue statique).

type FieldReachability =
  | { reachable: true }
  | { reachable: false; reason: string };

function isPlacedOn(
  tree: LayoutContainer | undefined,
  fieldId: string,
): boolean {
  if (!tree) return false;
  return collectLayoutPlacements(tree).some((p) => p.fieldId === fieldId);
}

function getFieldReachability(
  field: TemplateField,
  nodeLayout: LayoutContainer,
  windowLayout: LayoutContainer | undefined,
): FieldReachability {
  const onNode = isPlacedOn(nodeLayout, field.id);
  const onWindow = isPlacedOn(windowLayout, field.id);

  if (!onNode && !onWindow) {
    return {
      reachable: false,
      reason:
        "Not placed on either layout — only Nolë can read or write it, nobody can see it.",
    };
  }

  // Un placement en window éditable suffit : c'est la destination de toute
  // escalade, donc pas de dépendance à vérifier.
  if (windowLayout && onWindow) {
    const editableInWindow = collectLayoutPlacements(windowLayout).some(
      (p) =>
        p.fieldId === field.id &&
        resolveFieldVariant(field.type, "window", p.variant).edit !== "none",
    );
    if (editableInWindow) return { reachable: true };
  }

  if (onNode) {
    const nodePlacements = collectLayoutPlacements(nodeLayout).filter(
      (p) => p.fieldId === field.id,
    );
    for (const placement of nodePlacements) {
      const variant = resolveFieldVariant(field.type, "node", placement.variant);
      if (variant.edit === "inline" || variant.edit === "popover") {
        return { reachable: true };
      }
      if (variant.edit === "window") {
        // L'escalade n'aboutit que si la window existe ET affiche ce champ.
        if (windowLayout && onWindow) return { reachable: true };
        return {
          reachable: false,
          reason: windowLayout
            ? `Displayed as "${variant.label}", which opens the window — but this field is not placed on the window layout, so clicking it leads nowhere.`
            : `Displayed as "${variant.label}", which opens the window — but this template has no window layout.`,
        };
      }
    }
  }

  return {
    reachable: false,
    reason:
      "Every placement of this field is read-only — it can be displayed but never edited by hand.",
  };
}

export { getFieldReachability };
export type { FieldReachability };
