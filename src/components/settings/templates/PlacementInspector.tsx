import { TbChevronRight, TbLayoutColumns, TbLayoutRows, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Switch } from "@/components/shadcn/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type {
  LayoutContainer,
  LayoutFieldPlacement,
} from "@/../convex/config/templateConfig";
import {
  fieldVariants,
  parseVariantOptions,
  resolveFieldVariant,
  type FieldSurface,
} from "@/../convex/config/fieldVariants";
import OptionDescriptorsForm from "./OptionDescriptorsForm";
import {
  findLayoutNode,
  getAncestorPath,
  removeLayoutNode,
  updateLayoutNode,
  wrapInContainer,
} from "./templateDraft";

// Inspecteur du node de layout sélectionné : propriétés flex d'un
// container, options d'affichage d'un placement de champ.
//
// Porte aussi le fil d'ariane et le groupage, qui ne sont pas du confort : les
// containers n'ont aucune existence visuelle propre dans l'aperçu, donc sans
// eux rien n'indique où l'on se trouve ni comment créer une ligne.

type PlacementInspectorProps = {
  tree: LayoutContainer;
  selectedId: string | null;
  fields: TemplateField[];
  // Surface de l'arbre édité : les variants sont filtrés par leurs
  // `surfaces`, un même champ peut donc offrir des choix différents en node
  // et en window.
  surface: FieldSurface;
  onChangeTree: (tree: LayoutContainer) => void;
  onSelect: (nodeId: string) => void;
  onClearSelection: () => void;
};

export default function PlacementInspector({
  tree,
  selectedId,
  fields,
  surface,
  onChangeTree,
  onSelect,
  onClearSelection,
}: PlacementInspectorProps) {
  const node = selectedId ? findLayoutNode(tree, selectedId) : null;
  if (!node) {
    return (
      <p className="text-xs text-gray-400 italic">
        Click a field or a container in the preview to edit it.
      </p>
    );
  }

  const isRoot = node.id === tree.id;

  function patch(
    p: Partial<LayoutContainer> | Partial<LayoutFieldPlacement>,
  ) {
    onChangeTree(updateLayoutNode(tree, node!.id, p));
  }

  function handleRemove() {
    const { tree: next } = removeLayoutNode(tree, node!.id);
    onChangeTree(next);
    onClearSelection();
  }

  function handleWrap(direction: "row" | "column") {
    const { tree: next, containerId } = wrapInContainer(
      tree,
      node!.id,
      direction,
    );
    if (!containerId) return;
    onChangeTree(next);
    onSelect(containerId);
  }

  function labelFor(nodeId: string): string {
    const found = findLayoutNode(tree, nodeId);
    if (!found) return "?";
    if (found.kind === "container") {
      return found.direction === "row" ? "Row" : "Column";
    }
    return fields.find((f) => f.id === found.fieldId)?.name ?? "Unknown field";
  }

  // On exécute l'opération pour savoir si elle passe, plutôt que de réécrire
  // sa règle ici : c'est wrapInContainer qui décide (racine, profondeur max),
  // et une seconde formulation de la règle finirait par diverger.
  const canWrap = !isRoot && wrapInContainer(tree, node.id, "row").containerId !== null;

  const path = getAncestorPath(tree, node.id);

  const header = (
    <div className="space-y-2">
      {path.length > 1 && (
        <div className="flex items-center flex-wrap gap-0.5 text-[11px] text-gray-400">
          {path.map((id, i) => {
            const last = i === path.length - 1;
            return (
              <span key={id} className="flex items-center gap-0.5">
                {i > 0 && <TbChevronRight size={10} className="shrink-0" />}
                {last ? (
                  <span className="text-gray-600 font-medium">
                    {labelFor(id)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    className="hover:text-violet-600 hover:underline"
                  >
                    {labelFor(id)}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {canWrap && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-400 mr-1">Group in</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => handleWrap("row")}
            title="Wrap this element in a row — the way to put things side by side"
          >
            <TbLayoutColumns size={11} className="mr-1" /> Row
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => handleWrap("column")}
            title="Wrap this element in a column"
          >
            <TbLayoutRows size={11} className="mr-1" /> Column
          </Button>
        </div>
      )}
    </div>
  );

  if (node.kind === "container") {
    return (
      <div className="space-y-3">
        {header}
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-500">
            Container {isRoot && "(root)"}
          </h4>
          {!isRoot && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
              title="Remove container and its content"
            >
              <TbTrash size={13} />
            </Button>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Direction</Label>
          <ToggleGroup
            type="single"
            value={node.direction}
            onValueChange={(v) => {
              if (v === "row" || v === "column") patch({ direction: v });
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="column" className="h-7 px-2 text-xs">
              Column
            </ToggleGroupItem>
            <ToggleGroupItem value="row" className="h-7 px-2 text-xs">
              Row
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Gap (px)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={node.gap ?? 8}
              onChange={(e) => patch({ gap: Number(e.target.value) || 0 })}
              className="h-7"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Padding (px)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={node.padding ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                patch({ padding: v === 0 ? undefined : v });
              }}
              className="h-7"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Align</Label>
            <Select
              value={node.align ?? "stretch"}
              onValueChange={(v) =>
                patch({ align: v as LayoutContainer["align"] })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stretch">Stretch</SelectItem>
                <SelectItem value="start">Start</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="end">End</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Justify</Label>
            <Select
              value={node.justify ?? "start"}
              onValueChange={(v) =>
                patch({ justify: v as LayoutContainer["justify"] })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">Start</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="end">End</SelectItem>
                <SelectItem value="between">Space between</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  }

  const field = fields.find((f) => f.id === node.fieldId);
  const widthMode =
    typeof node.width === "number" ? "fixed" : (node.width ?? "auto");

  // Variants proposables ici = ceux autorisés sur CETTE surface. Le variant
  // effectif passe par resolveFieldVariant : si le placement en stocke un
  // qui n'existe plus (ou n'est pas autorisé ici), le sélecteur montre celui
  // réellement utilisé au rendu, pas une valeur fantôme.
  const variantChoices = field
    ? fieldVariants[field.type].variants.filter((v) =>
        (v.surfaces as FieldSurface[]).includes(surface),
      )
    : [];
  const resolvedVariant = field
    ? resolveFieldVariant(field.type, surface, node.variant)
    : null;

  return (
    <div className="space-y-3">
      {header}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 truncate">
          Field: {field?.name ?? "Unknown"}
        </h4>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={handleRemove}
          title="Remove from this layout (the field itself is kept)"
        >
          <TbTrash size={13} />
        </Button>
      </div>

      {resolvedVariant && variantChoices.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">Display as</Label>
          <Select
            value={resolvedVariant.id}
            onValueChange={(v) => {
              if (v === resolvedVariant.id) return;
              // variantOptions vidées DANS LE MÊME patch : chaque variant a
              // son propre optionsSchema, laisser survivre les options du
              // précédent produirait un rejet cryptique au save suivant.
              patch({ variant: v, variantOptions: undefined });
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variantChoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {resolvedVariant?.optionFields && (
        <OptionDescriptorsForm
          descriptors={resolvedVariant.optionFields}
          // Valeurs résolues et non brutes : l'utilisateur voit les défauts
          // effectifs, pas des champs vides qui suggéreraient à tort
          // « non configuré ».
          values={parseVariantOptions(resolvedVariant, node.variantOptions) ?? {}}
          onChange={(variantOptions) => patch({ variantOptions })}
          title={`${resolvedVariant.label} options`}
        />
      )}

      <div className="flex items-center justify-between">
        <Label className="text-xs">Show label</Label>
        <Switch
          checked={node.showLabel === true}
          onCheckedChange={(checked) =>
            patch({ showLabel: checked || undefined })
          }
        />
      </div>
      {resolvedVariant?.ownsLabel && node.showLabel === true && (
        <p className="text-[11px] text-gray-400 -mt-2">
          This variant shows the label inline, next to the field.
        </p>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Width</Label>
        <div className="flex gap-2">
          <Select
            value={widthMode}
            onValueChange={(v) => {
              if (v === "auto") patch({ width: undefined });
              else if (v === "fill") patch({ width: "fill" });
              else patch({ width: 120 });
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
              <SelectItem value="fixed">Fixed (px)</SelectItem>
            </SelectContent>
          </Select>
          {widthMode === "fixed" && (
            <Input
              type="number"
              min={20}
              value={typeof node.width === "number" ? node.width : 120}
              onChange={(e) =>
                patch({ width: Math.max(20, Number(e.target.value) || 20) })
              }
              className="h-7 w-20"
            />
          )}
        </div>
      </div>
    </div>
  );
}
