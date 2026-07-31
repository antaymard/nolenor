import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import toast from "react-hot-toast";
import { TbArchive, TbArchiveOff, TbDeviceFloppy } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
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
import LayoutTree from "./LayoutTree";
import PlacementInspector from "./PlacementInspector";
import TemplatePreview from "./TemplatePreview";
import {
  draftFromTemplate,
  genId,
  insertLayoutNode,
  newEmptyDraft,
  newField,
  newPlacement,
  removeFieldPlacements,
  resolveInsertionPoint,
  type LayoutSelection,
  type LayoutSurface,
  type TemplateDraft,
} from "./templateDraft";

// Éditeur d'un template (draft local + Save explicite). Monté avec une
// `key` par template : le draft est initialisé une fois, les updates
// distants ne clobberent pas l'édition en cours.

type TemplateEditorProps = {
  template?: Doc<"nodeTemplates">;
  onCreated?: (id: Id<"nodeTemplates">) => void;
  // Remonte l'état « draft non sauvegardé » à l'hôte. C'est lui qui possède
  // la fermeture (la modale), donc lui qui doit pouvoir la retenir — même
  // contrat que BlockNoteFieldEditor.
  onDirtyChange?: (dirty: boolean) => void;
};

export default function TemplateEditor({
  template,
  onCreated,
  onDirtyChange,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState<TemplateDraft>(() =>
    template ? draftFromTemplate(template) : newEmptyDraft(),
  );
  const [initialDraft] = useState(() => JSON.stringify(draft));
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  // La surface n'est plus un mode : elle est portée par la sélection, donc
  // désignée en cliquant dans l'aperçu visé.
  const [selection, setSelection] = useState<LayoutSelection>(null);
  // Survol partagé entre la maquette et la vue structurelle : survoler une
  // ligne du tree surligne l'élément dans l'aperçu, et réciproquement.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Au démontage, l'hôte doit repartir propre : sans ça, fermer l'éditeur sur
  // un draft sale laisserait la modale convaincue qu'il reste des
  // modifications, et elle redemanderait confirmation à la réouverture.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Surface de l'inspecteur : celle de la sélection, `node` par défaut quand
  // rien n'est sélectionné.
  const inspectedSurface: LayoutSurface = selection?.surface ?? "node";
  const inspectedTree =
    inspectedSurface === "window" && draft.windowLayout
      ? draft.windowLayout
      : draft.nodeLayout;

  function update(patch: Partial<TemplateDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function changeTree(target: LayoutSurface, tree: LayoutContainer) {
    if (target === "window") {
      update({ windowLayout: tree });
    } else {
      update({ nodeLayout: tree });
    }
  }

  // Insère un placement au point d'insertion dérivé de la sélection. Un seul
  // chemin pour l'ajout d'un nouveau champ et la pose d'un champ existant.
  function placeAtSelection(
    prev: TemplateDraft,
    fieldId: string,
    target: LayoutSurface,
  ): TemplateDraft {
    const tree =
      target === "window" && prev.windowLayout
        ? prev.windowLayout
        : prev.nodeLayout;
    // Le point d'insertion ne suit la sélection que si elle est sur CETTE
    // surface ; sinon on retombe sur la fin de la racine.
    const { containerId, index } = resolveInsertionPoint(
      tree,
      selection?.surface === target ? selection.nodeId : null,
    );
    const next = insertLayoutNode(
      tree,
      containerId,
      index,
      newPlacement(fieldId),
    );
    return target === "window"
      ? { ...prev, windowLayout: next }
      : { ...prev, nodeLayout: next };
  }

  function handleAddField(type: FieldType) {
    const field = newField(type);
    setDraft((prev) =>
      placeAtSelection(
        { ...prev, fields: [...prev.fields, field] },
        field.id,
        selection?.surface ?? "node",
      ),
    );
    setExpandedFieldId(field.id);
  }

  // Retire le placement d'un champ sur UNE surface — le champ lui-même est
  // conservé. C'est l'action de la pastille « Visible in … × ».
  function handleUnplaceField(fieldId: string, target: LayoutSurface) {
    setDraft((prev) => {
      if (target === "window") {
        if (!prev.windowLayout) return prev;
        return {
          ...prev,
          windowLayout: removeFieldPlacements(prev.windowLayout, fieldId),
        };
      }
      return {
        ...prev,
        nodeLayout: removeFieldPlacements(prev.nodeLayout, fieldId),
      };
    });
    // La sélection peut porter sur le placement qu'on vient de retirer.
    setSelection((prev) => (prev?.surface === target ? null : prev));
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
    setExpandedFieldId(null);
  }

  function handlePlaceField(fieldId: string, target: LayoutSurface) {
    setDraft((prev) => {
      if (target === "window" && !prev.windowLayout) return prev;
      return placeAtSelection(prev, fieldId, target);
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
      if (selection?.surface === "window") setSelection(null);
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

      {/* Réglages de template (et non de champ) : ce qui reste ici après que
          les dimensions et l'ouverture en window ont rejoint leur aperçu. */}
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
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
        {instanceCount !== undefined && instanceCount > 0 && (
          <span className="shrink-0 pt-6 text-xs text-gray-400">
            {instanceCount} node{instanceCount > 1 ? "s" : ""} use this template
          </span>
        )}
      </div>

      {/* Builder — catalogue des champs | maquette éditable | inspecteur */}
      <div className="grid grid-cols-[280px_1fr_300px] gap-4 flex-1 min-h-0">
        <FieldsPanel
          draft={draft}
          expandedFieldId={expandedFieldId}
          onExpandField={setExpandedFieldId}
          onAddField={handleAddField}
          onUpdateField={handleUpdateField}
          onRemoveField={handleRemoveField}
          onSetTitleField={(id) => update({ titleFieldId: id })}
          onPlaceField={handlePlaceField}
          onUnplaceField={handleUnplaceField}
          instanceCount={instanceCount}
        />

        <TemplatePreview
          draft={draft}
          selection={selection}
          onSelect={(s, nodeId) => setSelection({ surface: s, nodeId })}
          onChangeTree={changeTree}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onChangeDimensions={(patch) =>
            update({
              defaultDimensions: { ...draft.defaultDimensions, ...patch },
            })
          }
          onToggleWindow={handleToggleWindow}
        />

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-3 text-sm font-semibold text-gray-500">
              Field options ({inspectedSurface} view)
            </h3>
            <PlacementInspector
              tree={inspectedTree}
              selectedId={selection?.nodeId ?? null}
              fields={draft.fields}
              surface={inspectedSurface}
              onChangeTree={(tree) => changeTree(inspectedSurface, tree)}
              onSelect={(nodeId) =>
                setSelection({ surface: inspectedSurface, nodeId })
              }
              onClearSelection={() => setSelection(null)}
            />
          </div>

          {/* Vue structurelle, repliée. Deux arbres indépendants plutôt qu'un
              seul qui suivrait la sélection : son libellé changerait à chaque
              clic, et rien ne permettrait de comparer les deux surfaces. */}
          <div className="mt-auto space-y-2">
            <LayoutTree
              label="Tree (node)"
              tree={draft.nodeLayout}
              fields={draft.fields}
              selectedId={selection?.surface === "node" ? selection.nodeId : null}
              hoveredId={hoveredId}
              onSelect={(nodeId) => setSelection({ surface: "node", nodeId })}
              onHover={setHoveredId}
            />
            {draft.windowLayout && (
              <LayoutTree
                label="Tree (window)"
                tree={draft.windowLayout}
                fields={draft.fields}
                selectedId={
                  selection?.surface === "window" ? selection.nodeId : null
                }
                hoveredId={hoveredId}
                onSelect={(nodeId) =>
                  setSelection({ surface: "window", nodeId })
                }
                onHover={setHoveredId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
