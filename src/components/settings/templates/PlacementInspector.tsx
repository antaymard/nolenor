import { TbLayoutColumns, TbLayoutRows, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
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
  LayoutNode,
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
  removeLayoutNode,
  updateLayoutNode,
  wrapInContainer,
} from "./templateDraft";

// Inspecteur du node de layout sélectionné : propriétés flex d'un
// container, options d'affichage d'un placement de champ.
//
// Porte aussi le groupage, qui n'est pas du confort : c'est le seul moyen de
// créer une ligne, les containers n'ayant aucune existence visuelle propre
// dans l'aperçu. Le fil d'ariane, lui, vit au-dessus de l'aperçu qu'il
// décrit — pas ici.

// Contrôle de largeur, partagé par les placements de champ et les textes
// statiques : un seul rendu pour un seul vocabulaire. Deux copies finiraient
// par diverger sur un détail (le plancher à 20 px, le défaut à 120) et
// l'éditeur proposerait alors deux « largeurs » subtilement différentes.
function WidthControl({
  width,
  onChange,
}: {
  width?: number | "auto" | "fill";
  onChange: (width: number | "auto" | "fill" | undefined) => void;
}) {
  const mode = typeof width === "number" ? "fixed" : (width ?? "auto");

  return (
    <div className="space-y-1">
      <Label className="text-xs">Width</Label>
      <div className="flex gap-2">
        <Select
          value={mode}
          onValueChange={(v) => {
            if (v === "auto") onChange(undefined);
            else if (v === "fill") onChange("fill");
            else onChange(120);
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
        {mode === "fixed" && (
          <Input
            type="number"
            min={20}
            value={typeof width === "number" ? width : 120}
            onChange={(e) => onChange(Math.max(20, Number(e.target.value) || 20))}
            className="h-7 w-20"
          />
        )}
      </div>
    </div>
  );
}

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

  function patch(p: Partial<LayoutNode>) {
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

  // On exécute l'opération pour savoir si elle passe, plutôt que de réécrire
  // sa règle ici : c'est wrapInContainer qui décide (racine, profondeur max),
  // et une seconde formulation de la règle finirait par diverger.
  const canWrap = !isRoot && wrapInContainer(tree, node.id, "row").containerId !== null;

  const header = (
    <div className="space-y-2">
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

  // Un divider n'a rien à régler : son orientation se déduit de son parent et
  // sa couleur du node. Il garde l'en-tête (fil d'ariane, groupage) et la
  // suppression, comme tout élément de l'arbre.
  if (node.kind === "divider") {
    return (
      <div className="space-y-3">
        {header}
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-500">Divider</h4>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            title="Remove this divider"
          >
            <TbTrash size={13} />
          </Button>
        </div>
        <p className="text-[11px] text-gray-400">
          Horizontal in a column, vertical in a row. Takes the node colour on
          the canvas.
        </p>
      </div>
    );
  }

  // Le texte statique s'édite ICI et jamais en place : il appartient au
  // template, pas aux données du node — l'aperçu ne doit donc pas devenir une
  // surface de saisie.
  if (node.kind === "text") {
    return (
      <div className="space-y-3">
        {header}
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-500">Static text</h4>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            title="Remove this text"
          >
            <TbTrash size={13} />
          </Button>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Content</Label>
          <Textarea
            value={node.content}
            onChange={(e) => patch({ content: e.target.value })}
            placeholder="Section title, hint, caption…"
            className="min-h-16 text-sm"
          />
        </div>

        <WidthControl width={node.width} onChange={(width) => patch({ width })} />

        {/* Masqué en mode Fixed, où il ne pourrait que contredire une largeur
            déjà exacte. Le couple qui compte est Fill + Max : prendre la place
            disponible sans jamais dépasser. */}
        {typeof node.width !== "number" && (
          <div className="space-y-1">
            <Label className="text-xs">Max width</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={20}
                max={2000}
                value={node.maxWidth ?? ""}
                placeholder="None"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  patch({
                    maxWidth: raw
                      ? Math.min(2000, Math.max(20, Number(raw) || 20))
                      : undefined,
                  });
                }}
                className="h-7 w-24"
              />
              {node.maxWidth !== undefined && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-muted-foreground"
                  onClick={() => patch({ maxWidth: undefined })}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              Caps the line length. The text stays narrower when its content is
              short — unlike a fixed width.
            </p>
          </div>
        )}
      </div>
    );
  }

  const field = fields.find((f) => f.id === node.fieldId);

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

      <WidthControl width={node.width} onChange={(width) => patch({ width })} />
    </div>
  );
}
