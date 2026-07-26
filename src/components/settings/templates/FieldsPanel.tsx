import {
  TbAlertTriangle,
  TbLock,
  TbPlus,
  TbStar,
  TbStarFilled,
  TbTrash,
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
import { getFieldReachability } from "./fieldReachability";
import type { TemplateDraft } from "./templateDraft";

type FieldsPanelProps = {
  draft: TemplateDraft;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onAddField: (type: FieldType) => void;
  onUpdateField: (id: string, patch: Partial<TemplateField>) => void;
  onRemoveField: (id: string) => void;
  onSetTitleField: (id: string | undefined) => void;
  onPlaceField: (fieldId: string, surface: "node" | "window") => void;
  instanceCount?: number;
};

// Ordre du menu d'ajout = ordre canonique du schéma (fieldTypeValues), pas
// l'ordre de déclaration du registry : celui-ci est un détail
// d'implémentation, réordonner ses entrées ne doit pas réordonner l'UI.
const FIELD_TYPES = fieldTypeValues;

export default function FieldsPanel({
  draft,
  selectedFieldId,
  onSelectField,
  onAddField,
  onUpdateField,
  onRemoveField,
  onSetTitleField,
  onPlaceField,
  instanceCount,
}: FieldsPanelProps) {
  const placedOnNode = new Set(collectLayoutFieldIds(draft.nodeLayout));
  const placedOnWindow = new Set(
    draft.windowLayout ? collectLayoutFieldIds(draft.windowLayout) : [],
  );

  const selectedField =
    draft.fields.find((f) => f.id === selectedFieldId) ?? null;

  function handleRemove(field: TemplateField) {
    const count = instanceCount ?? 0;
    const message =
      count > 0
        ? `Delete field "${field.name}"? ${count} node${count > 1 ? "s" : ""} use this template — their values for this field will be hidden but kept (recoverable via version history).`
        : `Delete field "${field.name}"?`;
    if (window.confirm(message)) {
      onRemoveField(field.id);
    }
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500">Fields</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon-sm" variant="outline">
              <TbPlus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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

      <div className="divide-y divide-gray-200 border border-gray-200 bg-white rounded-md overflow-hidden">
        {draft.fields.length === 0 && (
          <p className="text-sm text-gray-500 italic p-3">No fields yet.</p>
        )}
        {draft.fields.map((field) => {
          const Icon = fieldRegistry[field.type].icon;
          const isTitle = draft.titleFieldId === field.id;
          const reachability = getFieldReachability(
            field,
            draft.nodeLayout,
            draft.windowLayout,
          );
          return (
            <button
              key={field.id}
              type="button"
              onClick={() =>
                onSelectField(selectedFieldId === field.id ? null : field.id)
              }
              className={cn(
                "w-full text-left px-2.5 py-2 hover:bg-gray-100 transition-colors flex items-center gap-2",
                selectedFieldId === field.id &&
                  "bg-violet-50 hover:bg-violet-100",
              )}
            >
              <Icon size={14} className="shrink-0 text-gray-500" />
              <span className="text-sm font-medium truncate flex-1">
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
              <span className="flex gap-1 shrink-0">
                <span
                  className={cn(
                    "text-[10px] rounded px-1 py-px",
                    placedOnNode.has(field.id)
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-400",
                  )}
                >
                  node
                </span>
                <span
                  className={cn(
                    "text-[10px] rounded px-1 py-px",
                    placedOnWindow.has(field.id)
                      ? "bg-violet-100 text-violet-700"
                      : "bg-gray-100 text-gray-400",
                  )}
                >
                  window
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedField && (
        <div className="border border-gray-200 rounded-md p-3 space-y-3 bg-gray-50">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={selectedField.name}
              onChange={(e) =>
                onUpdateField(selectedField.id, { name: e.target.value })
              }
              className="h-8"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <TbLock size={12} />
            <span>
              Type: {getFieldTypeConfig(selectedField.type).label} — locked
              after creation. Duplicate as a new field to change it.
            </span>
          </div>

          {(() => {
            const reachability = getFieldReachability(
              selectedField,
              draft.nodeLayout,
              draft.windowLayout,
            );
            if (reachability.reachable) return null;
            return (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <TbAlertTriangle size={13} className="mt-px shrink-0" />
                <span>{reachability.reason}</span>
              </div>
            );
          })()}

          <div className="space-y-1">
            <Label className="text-xs">AI description (optional)</Label>
            <Textarea
              value={selectedField.description ?? ""}
              onChange={(e) =>
                onUpdateField(selectedField.id, {
                  description: e.target.value || undefined,
                })
              }
              placeholder="Helps Nolë understand what this field is for"
              className="text-sm min-h-14"
            />
          </div>

          {/* Réglage du TEMPLATE (titleFieldId), pas du champ : reste ici, et
              n'a de sens que pour short_text (cf. templateConfig). */}
          {selectedField.type === "short_text" && (
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <TbStar size={12} /> Use as node title
              </Label>
              <Switch
                checked={draft.titleFieldId === selectedField.id}
                onCheckedChange={(checked) =>
                  onSetTitleField(checked ? selectedField.id : undefined)
                }
              />
            </div>
          )}

          {/* Options du champ : fournies par le registry. Ajouter un type ne
              demande plus de toucher ce fichier. */}
          {(() => {
            const OptionsEditor = fieldRegistry[selectedField.type].OptionsEditor;
            if (!OptionsEditor) return null;
            return (
              <OptionsEditor
                field={selectedField}
                onChange={(patch) => onUpdateField(selectedField.id, patch)}
              />
            );
          })()}

          <div className="flex items-center gap-2 pt-1">
            {!placedOnNode.has(selectedField.id) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onPlaceField(selectedField.id, "node")}
              >
                <TbPlus size={12} className="mr-1" /> Node
              </Button>
            )}
            {draft.windowLayout && !placedOnWindow.has(selectedField.id) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onPlaceField(selectedField.id, "window")}
              >
                <TbPlus size={12} className="mr-1" /> Window
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs ml-auto text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(selectedField)}
            >
              <TbTrash size={12} className="mr-1" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
