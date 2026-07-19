import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import toast from "react-hot-toast";
import { TbArchive, TbArchiveOff, TbDeviceFloppy } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
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
import { cn } from "@/lib/utils";
import nodeColors from "@/components/nodes/nodeColors";
import type { colorsEnum } from "@/types/domain";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import {
  validateTemplateDefinition,
  type LayoutContainer,
} from "@/../convex/config/templateConfig";
import {
  getTemplateIcon,
  templateIconMap,
  templateIconNames,
} from "@/components/fields/registry/templateIcons";
import FieldsPanel from "./FieldsPanel";
import LayoutCanvas from "./LayoutCanvas";
import PlacementInspector from "./PlacementInspector";
import TemplatePreview from "./TemplatePreview";
import {
  draftFromTemplate,
  genId,
  newEmptyDraft,
  newField,
  newPlacement,
  removeFieldPlacements,
  type TemplateDraft,
} from "./templateDraft";

// Éditeur d'un template (draft local + Save explicite). Monté avec une
// `key` par template : le draft est initialisé une fois, les updates
// distants ne clobberent pas l'édition en cours.

type TemplateEditorProps = {
  template?: Doc<"nodeTemplates">;
  onCreated?: (id: Id<"nodeTemplates">) => void;
};

export default function TemplateEditor({
  template,
  onCreated,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState<TemplateDraft>(() =>
    template ? draftFromTemplate(template) : newEmptyDraft(),
  );
  const [initialDraft] = useState(() => JSON.stringify(draft));
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [surface, setSurface] = useState<"node" | "window">("node");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState(initialDraft);

  const createTemplate = useMutation(api.nodeTemplates.create);
  const updateTemplate = useMutation(api.nodeTemplates.update);
  const setArchived = useMutation(api.nodeTemplates.setArchived);

  const instanceCount = useQuery(
    api.nodeTemplates.countInstances,
    template ? { templateId: template._id } : "skip",
  );

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== savedSnapshot,
    [draft, savedSnapshot],
  );

  const activeTree =
    surface === "window" && draft.windowLayout
      ? draft.windowLayout
      : draft.nodeLayout;

  function update(patch: Partial<TemplateDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function changeActiveTree(tree: LayoutContainer) {
    if (surface === "window") {
      update({ windowLayout: tree });
    } else {
      update({ nodeLayout: tree });
    }
  }

  function handleAddField(type: FieldType) {
    const field = newField(type);
    setDraft((prev) => {
      const next = { ...prev, fields: [...prev.fields, field] };
      // Placé automatiquement à la racine de la surface active.
      if (surface === "window" && next.windowLayout) {
        next.windowLayout = {
          ...next.windowLayout,
          children: [...next.windowLayout.children, newPlacement(field.id)],
        };
      } else {
        next.nodeLayout = {
          ...next.nodeLayout,
          children: [...next.nodeLayout.children, newPlacement(field.id)],
        };
      }
      return next;
    });
    setSelectedFieldId(field.id);
  }

  function handleUpdateField(id: string, patch: Partial<TemplateField>) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function handleRemoveField(id: string) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
      nodeLayout: removeFieldPlacements(prev.nodeLayout, id),
      windowLayout: prev.windowLayout
        ? removeFieldPlacements(prev.windowLayout, id)
        : undefined,
      titleFieldId: prev.titleFieldId === id ? undefined : prev.titleFieldId,
    }));
    setSelectedFieldId(null);
  }

  function handlePlaceField(fieldId: string, target: "node" | "window") {
    setDraft((prev) => {
      if (target === "window") {
        if (!prev.windowLayout) return prev;
        return {
          ...prev,
          windowLayout: {
            ...prev.windowLayout,
            children: [...prev.windowLayout.children, newPlacement(fieldId)],
          },
        };
      }
      return {
        ...prev,
        nodeLayout: {
          ...prev.nodeLayout,
          children: [...prev.nodeLayout.children, newPlacement(fieldId)],
        },
      };
    });
  }

  function handleToggleWindow(enabled: boolean) {
    if (enabled) {
      update({
        windowLayout: draft.windowLayout ?? {
          kind: "container",
          id: genId("c"),
          direction: "column",
          gap: 12,
          padding: 16,
          children: [],
        },
      });
    } else {
      if (
        draft.windowLayout &&
        draft.windowLayout.children.length > 0 &&
        !window.confirm(
          "Disable the window view? The window layout will be discarded.",
        )
      ) {
        return;
      }
      update({ windowLayout: undefined });
      if (surface === "window") setSurface("node");
    }
  }

  async function handleSave() {
    const validation = validateTemplateDefinition({
      fields: draft.fields,
      nodeLayout: draft.nodeLayout,
      windowLayout: draft.windowLayout,
      titleFieldId: draft.titleFieldId,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      toast.error("Invalid template — see details below the header.");
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim() || "Untitled template",
        description: draft.description || undefined,
        llmDescription: draft.llmDescription || undefined,
        icon: draft.icon,
        color: draft.color,
        fields: draft.fields,
        nodeLayout: draft.nodeLayout,
        windowLayout: draft.windowLayout,
        titleFieldId: draft.titleFieldId,
        defaultDimensions: draft.defaultDimensions,
        windowSize: draft.windowSize,
      };
      if (template) {
        await updateTemplate({ templateId: template._id, ...payload });
      } else {
        const id = await createTemplate(payload);
        onCreated?.(id);
      }
      setSavedSnapshot(JSON.stringify(draft));
      toast.success("Template saved");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save template",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (!template) return;
    const archived = template.archivedAt === undefined;
    if (
      archived &&
      (instanceCount ?? 0) > 0 &&
      !window.confirm(
        `Archive this template? ${instanceCount} existing node${(instanceCount ?? 0) > 1 ? "s" : ""} will keep rendering, but it will no longer appear in the add menu.`,
      )
    ) {
      return;
    }
    await setArchived({ templateId: template._id, archived });
    toast.success(archived ? "Template archived" : "Template restored");
  }

  const Icon = getTemplateIcon(draft.icon);

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon">
              <Icon size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="grid grid-cols-5 gap-1 p-2">
            {templateIconNames.map((name) => {
              const ItemIcon = templateIconMap[name];
              return (
                <DropdownMenuItem
                  key={name}
                  onClick={() => update({ icon: name })}
                  className={cn(
                    "justify-center",
                    draft.icon === name && "bg-violet-100",
                  )}
                >
                  <ItemIcon size={15} />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Template name"
          className="h-9 flex-1 font-medium"
        />

        <Select
          value={draft.color ?? "default"}
          onValueChange={(v) => update({ color: v })}
        >
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(nodeColors) as colorsEnum[]).map((c) => (
              <SelectItem key={c} value={c}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full border border-gray-300",
                      nodeColors[c].bg,
                    )}
                  />
                  {nodeColors[c].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {template && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleToggleArchive}
            title={
              template.archivedAt === undefined
                ? "Archive template"
                : "Restore template"
            }
          >
            {template.archivedAt === undefined ? (
              <TbArchive size={16} />
            ) : (
              <TbArchiveOff size={16} />
            )}
          </Button>
        )}

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          <TbDeviceFloppy size={16} className="mr-1" />
          {saving ? "Saving…" : template ? "Save" : "Create"}
          {isDirty && !saving && (
            <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
          )}
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 space-y-0.5">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">AI description</Label>
          <Textarea
            value={draft.llmDescription ?? ""}
            onChange={(e) =>
              update({ llmDescription: e.target.value || undefined })
            }
            placeholder="Tells Nolë when to use this node type (auto-generated from fields if empty)"
            className="text-sm min-h-12"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Label className="text-xs shrink-0">Node size</Label>
            <Input
              type="number"
              min={60}
              value={draft.defaultDimensions.width}
              onChange={(e) =>
                update({
                  defaultDimensions: {
                    ...draft.defaultDimensions,
                    width: Number(e.target.value) || 60,
                  },
                })
              }
              className="h-7 w-20"
            />
            <span className="text-xs text-gray-400">×</span>
            <Input
              type="number"
              min={33}
              value={draft.defaultDimensions.height}
              onChange={(e) =>
                update({
                  defaultDimensions: {
                    ...draft.defaultDimensions,
                    height: Number(e.target.value) || 33,
                  },
                })
              }
              className="h-7 w-20"
            />
            <Label className="text-xs">Resizable</Label>
            <Switch
              checked={draft.defaultDimensions.resizable !== false}
              onCheckedChange={(checked) =>
                update({
                  defaultDimensions: {
                    ...draft.defaultDimensions,
                    resizable: checked ? true : false,
                  },
                })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs shrink-0">Openable in window</Label>
            <Switch
              checked={draft.windowLayout !== undefined}
              onCheckedChange={handleToggleWindow}
            />
            {instanceCount !== undefined && instanceCount > 0 && (
              <span className="text-xs text-gray-400 ml-auto">
                {instanceCount} node{instanceCount > 1 ? "s" : ""} use this
                template
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Builder */}
      <div className="grid grid-cols-[280px_1fr_280px] gap-4 flex-1 min-h-0">
        <FieldsPanel
          draft={draft}
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
          onAddField={handleAddField}
          onUpdateField={handleUpdateField}
          onRemoveField={handleRemoveField}
          onSetTitleField={(id) => update({ titleFieldId: id })}
          onPlaceField={handlePlaceField}
          instanceCount={instanceCount}
        />

        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto pr-1">
          <ToggleGroup
            type="single"
            value={surface}
            onValueChange={(v) => {
              if (v === "node" || v === "window") {
                setSurface(v);
                setSelectedLayoutId(null);
              }
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="node" className="h-7 px-3 text-xs">
              Node layout
            </ToggleGroupItem>
            <ToggleGroupItem
              value="window"
              disabled={!draft.windowLayout}
              className="h-7 px-3 text-xs"
            >
              Window layout
            </ToggleGroupItem>
          </ToggleGroup>

          <LayoutCanvas
            tree={activeTree}
            fields={draft.fields}
            selectedId={selectedLayoutId}
            onSelect={setSelectedLayoutId}
            onChangeTree={changeActiveTree}
          />

          <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
            <PlacementInspector
              tree={activeTree}
              selectedId={selectedLayoutId}
              fields={draft.fields}
              onChangeTree={changeActiveTree}
              onClearSelection={() => setSelectedLayoutId(null)}
            />
          </div>
        </div>

        <TemplatePreview draft={draft} />
      </div>
    </div>
  );
}
