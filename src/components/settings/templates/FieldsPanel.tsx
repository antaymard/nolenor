import {
  TbAlertTriangle,
  TbChevronDown,
  TbChevronRight,
  TbPlus,
  TbStar,
  TbStarFilled,
  TbTrash,
  TbX,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Switch } from "@/components/shadcn/switch";
import { Textarea } from "@/components/shadcn/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import { fieldRegistry } from "@/components/fields/registry/fieldRegistry";
import {
  fieldTypeValues,
  type FieldType,
} from "@/../convex/schemas/fieldTypeSchema";
import {
  getFieldTypeConfig,
  type TemplateField,
} from "@/../convex/config/fieldConfig";
import { collectLayoutFieldIds } from "@/../convex/config/templateConfig";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { getFieldReachability } from "./fieldReachability";
import OptionDescriptorsForm from "./OptionDescriptorsForm";
import FieldDefaultValueEditor from "./FieldDefaultValueEditor";
import type { LayoutSurface, TemplateDraft } from "./templateDraft";

// Le catalogue des champs : QUELLES DONNÉES existent, par opposition aux
// aperçus qui disent à quoi elles ressemblent. Une carte dépliable par champ,
// une seule ouverte à la fois.
//
// Les pastilles de surface sont actionnables : elles ont absorbé les anciens
// boutons « + Node / + Window », qui disaient la même chose une seconde fois.

type FieldsPanelProps = {
  draft: TemplateDraft;
  expandedFieldId: string | null;
  onExpandField: (id: string | null) => void;
  onAddField: (type: FieldType) => void;
  onUpdateField: (id: string, patch: Partial<TemplateField>) => void;
  onRemoveField: (id: string) => void;
  onSetTitleField: (id: string | undefined) => void;
  onPlaceField: (fieldId: string, surface: LayoutSurface) => void;
  onUnplaceField: (fieldId: string, surface: LayoutSurface) => void;
  instanceCount?: number;
};

// Ordre du menu d'ajout = ordre canonique du schéma (fieldTypeValues), pas
// l'ordre de déclaration du registry : celui-ci est un détail
// d'implémentation, réordonner ses entrées ne doit pas réordonner l'UI.
const FIELD_TYPES = fieldTypeValues;

function SurfaceChip({
  label,
  placed,
  tone,
  onAdd,
  onRemove,
}: {
  label: string;
  placed: boolean;
  tone: "node" | "window";
  onAdd: () => void;
  onRemove: () => void;
}) {
  if (!placed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        className="flex items-center gap-1 rounded-full bg-slate-100 text-sm text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-500 px-2 py-1"
      >
        <TbPlus size={10} strokeWidth={3} /> Display in {label}
      </button>
    );
  }
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full text-sm px-2 py-1",
        tone === "node"
          ? "bg-blue-100 text-blue-700"
          : "bg-violet-100 text-violet-700",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title={`Remove from the ${label} layout (the field itself is kept)`}
        className="opacity-60 transition-opacity hover:opacity-100"
      >
        <TbX size={10} strokeWidth={3} />
      </button>
      Visible in {label}
    </span>
  );
}

export default function FieldsPanel({
  draft,
  expandedFieldId,
  onExpandField,
  onAddField,
  onUpdateField,
  onRemoveField,
  onSetTitleField,
  onPlaceField,
  onUnplaceField,
  instanceCount,
}: FieldsPanelProps) {
  const placedOnNode = new Set(collectLayoutFieldIds(draft.nodeLayout));
  const placedOnWindow = new Set(
    draft.windowLayout ? collectLayoutFieldIds(draft.windowLayout) : [],
  );

  // Le nom du champ vit dans le titre du dialogue, le corps ne porte que la
  // conséquence — qui n'existe que s'il y a des instances.
  function deleteWarning(field: TemplateField): string {
    const count = instanceCount ?? 0;
    if (count === 0) {
      return `"${field.name}" and its layout placements will be removed from this template.`;
    }
    return `${count} node${count > 1 ? "s" : ""} use this template. Their values for "${field.name}" will be hidden but kept, and stay recoverable via version history.`;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5 py-4 border-r border-slate-200">
      <div>
        <h3 className="text-md font-bold">FIELDS</h3>
        <p className="text-[10px] opacity-60 leading-tight">
          The data this node type holds. Place a field on a surface to make it
          visible there.
        </p>
      </div>

      <div className="flex flex-col">
        {draft.fields.length === 0 && (
          <p className="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-500 italic">
            No fields yet.
          </p>
        )}

        {draft.fields.map((field, i) => {
          const Icon = fieldRegistry[field.type].icon;
          const isTitle = draft.titleFieldId === field.id;
          const expanded = expandedFieldId === field.id;
          const prevExpanded =
            i > 0 && expandedFieldId === draft.fields[i - 1].id;
          const nextExpanded =
            i < draft.fields.length - 1 &&
            expandedFieldId === draft.fields[i + 1].id;
          const reachability = getFieldReachability(
            field,
            draft.nodeLayout,
            draft.windowLayout,
          );
          const config = getFieldTypeConfig(field.type);
          const OptionsEditor = fieldRegistry[field.type].OptionsEditor;
          const patchField = (patch: Partial<TemplateField>) =>
            onUpdateField(field.id, patch);

          return (
            <div
              key={field.id}
              className={cn(
                "overflow-hidden border bg-white transition-colors border-slate-200 border-b-0 hover:bg-slate-100",
                expanded
                  ? "rounded-md border-b my-5 bg-slate-100"
                  : cn(
                      "first-of-type:rounded-t-md last-of-type:rounded-b-md last-of-type:border-b",
                      prevExpanded && "rounded-t-md",
                      nextExpanded && "rounded-b-md border-b",
                    ),
              )}
            >
              <button
                type="button"
                onClick={() => onExpandField(expanded ? null : field.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors ",
                )}
              >
                <div className="rounded-sm bg-slate-100 text-slate-500 flex items-center justify-center p-2">
                  <Icon size={14} className="shrink-0" />
                </div>
                <span className="flex-1 truncate font-medium">
                  {field.name}
                </span>
                {isTitle && (
                  <TbStarFilled
                    size={12}
                    className="shrink-0 text-amber-500"
                    title="Node title field"
                  />
                )}
                {!reachability.reachable && (
                  <TbAlertTriangle
                    size={12}
                    className="shrink-0 text-amber-600"
                    title={reachability.reason}
                  />
                )}
                {expanded ? (
                  <TbChevronDown size={14} className="shrink-0 text-gray-400" />
                ) : (
                  <TbChevronRight
                    size={14}
                    className="shrink-0 text-gray-400"
                  />
                )}
              </button>

              <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                <SurfaceChip
                  label="node"
                  tone="node"
                  placed={placedOnNode.has(field.id)}
                  onAdd={() => onPlaceField(field.id, "node")}
                  onRemove={() => onUnplaceField(field.id, "node")}
                />
                {draft.windowLayout && (
                  <SurfaceChip
                    label="window"
                    tone="window"
                    placed={placedOnWindow.has(field.id)}
                    onAdd={() => onPlaceField(field.id, "window")}
                    onRemove={() => onUnplaceField(field.id, "window")}
                  />
                )}
              </div>

              {expanded && (
                <div className="space-y-5 border-t border-slate-200 bg-white p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={field.name}
                      onChange={(e) => patchField({ name: e.target.value })}
                      className="h-8"
                    />
                  </div>

                  {!reachability.reachable && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      <TbAlertTriangle size={13} className="mt-px shrink-0" />
                      <span>{reachability.reason}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">AI description (optional)</Label>
                    <Textarea
                      value={field.description ?? ""}
                      onChange={(e) =>
                        patchField({ description: e.target.value || undefined })
                      }
                      placeholder="Helps Nolë understand what this field is for"
                      className="min-h-14 text-sm"
                    />
                  </div>

                  {/* Réglage du TEMPLATE (titleFieldId), pas du champ : n'a de
                      sens que pour short_text (cf. templateConfig). */}
                  {field.type === "short_text" && (
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1 text-xs">
                        <TbStar size={12} /> Use as node title
                      </Label>
                      <Switch
                        checked={draft.titleFieldId === field.id}
                        onCheckedChange={(checked) =>
                          onSetTitleField(checked ? field.id : undefined)
                        }
                      />
                    </div>
                  )}

                  {/* Trois blocs indépendants, aucun ne connaît de type de
                      champ : options déclarées rendues par un formulaire
                      dérivé, éditeur dédié si le registry en déclare un, et
                      valeur par défaut saisie via le champ lui-même. */}
                  {config.optionFields.length > 0 && (
                    <OptionDescriptorsForm
                      descriptors={config.optionFields}
                      // Valeurs BRUTES : les options d'un champ n'ont pas de
                      // défaut injecté, un contrôle vide veut dire « non
                      // configuré » et doit le rester.
                      values={field.options ?? {}}
                      onChange={(options) => patchField({ options })}
                    />
                  )}

                  {OptionsEditor && (
                    <OptionsEditor field={field} onChange={patchField} />
                  )}

                  {config.supportsDefault && (
                    <FieldDefaultValueEditor
                      field={field}
                      onChange={patchField}
                    />
                  )}

                  <ConfirmableButton
                    title={`Delete field "${field.name}"?`}
                    text={deleteWarning(field)}
                    confirmLabel="Delete field"
                    cancelLabel="Keep it"
                    destructive
                    onConfirm={() => onRemoveField(field.id)}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <TbTrash size={12} className="mr-1" /> Delete
                    </Button>
                  </ConfirmableButton>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="mt-auto w-full border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
          >
            <TbPlus size={14} className="mr-1" /> Add a new field
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {FIELD_TYPES.map((type) => {
            const Icon = fieldRegistry[type].icon;
            return (
              <DropdownMenuItem key={type} onClick={() => onAddField(type)}>
                <Icon size={14} className="mr-2" />
                {getFieldTypeConfig(type).label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
