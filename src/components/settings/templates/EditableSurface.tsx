import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { INTO_PREFIX } from "@/components/fields/layout/layoutEditing";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { LayoutContainer } from "@/../convex/config/templateConfig";
import {
  findLayoutNode,
  findParentId,
  moveLayoutNode,
  updateLayoutNode,
  type LayoutSurface,
} from "./templateDraft";

// Un aperçu rendu ÉDITABLE : le rendu réel du layout devient la surface de
// manipulation. Sélection au clic, réordonnancement au glisser.
//
// Un DndContext PAR surface, et c'est voulu : glisser d'un aperçu à l'autre
// devient impossible par construction. Les deux arbres sont indépendants, un
// champ n'apparaît qu'une fois par arbre, et « placer aussi sur l'autre
// surface » est une autre opération — celle des boutons de FieldsPanel.

type EditableSurfaceProps = {
  tree: LayoutContainer;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: LayoutSurface;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onChangeTree: (tree: LayoutContainer) => void;
  // Survol contrôlé par l'hôte, et non local : la vue structurelle repliable
  // surligne dans la maquette la ligne qu'on survole chez elle, et
  // réciproquement. Deux états séparés ne pourraient pas se répondre.
  hoveredId: string | null;
  onHover: (nodeId: string | null) => void;
};

export default function EditableSurface({
  tree,
  fields,
  values,
  surface,
  selectedId,
  onSelect,
  onChangeTree,
  hoveredId,
  onHover,
}: EditableSurfaceProps) {
  // Aucune poignée de glissement : sur un champ de 20 px de haut il n'y a pas
  // la place. Le placement entier est l'activateur, et c'est cette contrainte
  // de distance qui sépare le clic (sélection) du glissement (déplacement).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Transposition de l'ancien LayoutCanvas : la logique était déjà correcte,
  // seules les cibles changent (les champs rendus, plus les lignes d'un arbre).
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Dépôt dans un container vide → premier enfant.
    if (overId.startsWith(INTO_PREFIX)) {
      const containerId = overId.slice(INTO_PREFIX.length);
      if (containerId === activeId) return;
      onChangeTree(moveLayoutNode(tree, activeId, containerId, undefined));
      return;
    }

    const overParentId = findParentId(tree, overId);
    if (!overParentId) return;
    const overParent = findLayoutNode(tree, overParentId) as LayoutContainer;
    const activeParentId = findParentId(tree, activeId);

    if (activeParentId === overParentId) {
      // Réordonnancement dans le même container (sémantique arrayMove).
      const ids = overParent.children.map((c) => c.id);
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0) return;
      onChangeTree(
        updateLayoutNode(tree, overParentId, {
          children: arrayMove(overParent.children, from, to),
        }),
      );
    } else {
      const index = overParent.children.findIndex((c) => c.id === overId);
      // moveLayoutNode refuse déjà de déplacer un container dans lui-même ou
      // dans un de ses descendants — inutile de le regarder ici.
      onChangeTree(
        moveLayoutNode(tree, activeId, overParentId, Math.max(0, index)),
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      // `pointerWithin` et non `closestCorners` : ce dernier désigne toujours
      // la cible la plus proche, même quand le pointeur est loin de tout. Un
      // glissement relâché HORS de cet aperçu déplaçait donc quand même le
      // champ, à un endroit que personne n'avait visé. Ici, hors de toute
      // cible, `over` est nul et le geste est annulé — ce qui rend aussi le
      // glissement vers l'autre aperçu réellement sans effet.
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
    >
      <LayoutRenderer
        tree={tree}
        fields={fields}
        values={values}
        surface={surface}
        editor={{ selectedId, hoveredId, onSelect, onHover }}
      />
    </DndContext>
  );
}
