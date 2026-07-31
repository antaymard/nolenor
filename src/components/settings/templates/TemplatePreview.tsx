import { useMemo, useState } from "react";
import { TbChevronRight } from "react-icons/tb";
import nodeColors from "@/components/nodes/nodeColors";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Switch } from "@/components/shadcn/switch";
import {
  buildSampleValues,
  type FieldSampleKind,
} from "@/components/fields/registry/fieldSamples";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { LayoutContainer } from "@/../convex/config/templateConfig";
import EditableSurface from "./EditableSurface";
import {
  findLayoutNode,
  getAncestorPath,
  type LayoutSelection,
  type LayoutSurface,
  type TemplateDraft,
} from "./templateDraft";

// Les deux aperçus, rendus éditables. C'est la surface de travail : on
// manipule la maquette elle-même, il n'y a plus de vue structurelle en regard
// — seulement, à droite, une projection repliée pour les cas que la maquette
// ne peut pas montrer.
//
// Chaque réglage vit à côté de ce qu'il gouverne : la taille du node contre
// l'aperçu node, l'ouverture en window contre l'aperçu window.

const SAMPLE_KINDS: { value: FieldSampleKind; label: string; title: string }[] =
  [
    { value: "filled", label: "Filled", title: "Typical values" },
    { value: "empty", label: "Empty", title: "A freshly created node" },
    {
      value: "overflow",
      label: "Overflow",
      title: "Long values — reveals layouts that don't hold",
    },
  ];

// `zoom` et non `transform: scale` : scale fausse le calcul de rectangles de
// dnd-kit, là où zoom laisse les coordonnées de hit-test cohérentes.
const ZOOM_LEVELS = [1, 1.5, 2];

// Fond façon canvas derrière l'aperçu node. Purement décoratif, et posé sur un
// conteneur EXTÉRIEUR au cadre : la géométrie du rendu doit rester celle du
// canvas réel, au pixel près.
const CANVAS_BACKDROP = {
  backgroundImage:
    "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
};

type TemplatePreviewProps = {
  draft: TemplateDraft;
  selection: LayoutSelection;
  onSelect: (surface: LayoutSurface, nodeId: string) => void;
  onChangeTree: (surface: LayoutSurface, tree: LayoutContainer) => void;
  hoveredId: string | null;
  onHover: (nodeId: string | null) => void;
  onChangeDimensions: (
    patch: Partial<TemplateDraft["defaultDimensions"]>,
  ) => void;
  onToggleWindow: (enabled: boolean) => void;
};

// Chemin des ancêtres de la sélection, au-dessus de l'aperçu qu'il décrit.
// Sans lui, rien n'indique dans quel container on se trouve : les containers
// n'ont aucune existence visuelle propre.
function Breadcrumb({
  tree,
  fields,
  nodeId,
  onSelect,
}: {
  tree: LayoutContainer;
  fields: TemplateField[];
  nodeId: string;
  onSelect: (nodeId: string) => void;
}) {
  const path = getAncestorPath(tree, nodeId);
  if (path.length === 0) return null;

  const labelFor = (id: string) => {
    const found = findLayoutNode(tree, id);
    if (!found) return "?";
    if (found.kind === "container") {
      return found.direction === "row" ? "Row" : "Column";
    }
    return fields.find((f) => f.id === found.fieldId)?.name ?? "Unknown field";
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 text-[11px] text-gray-400">
      {path.map((id, i) => {
        const last = i === path.length - 1;
        return (
          <span key={id} className="flex items-center gap-0.5">
            {i > 0 && <TbChevronRight size={10} className="shrink-0" />}
            {last ? (
              <span className="font-medium text-gray-600">{labelFor(id)}</span>
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
  );
}

export default function TemplatePreview({
  draft,
  selection,
  onSelect,
  onChangeTree,
  hoveredId,
  onHover,
  onChangeDimensions,
  onToggleWindow,
}: TemplatePreviewProps) {
  const [sampleKind, setSampleKind] = useState<FieldSampleKind>("filled");
  const [zoom, setZoom] = useState(1);

  const values = useMemo(
    () => buildSampleValues(draft.fields, sampleKind),
    [draft.fields, sampleKind],
  );

  const color = nodeColors[(draft.color as colorsEnum) ?? "default"];
  const Icon = getTemplateIcon(draft.icon);

  const selectedIdFor = (surface: LayoutSurface) =>
    selection?.surface === surface ? selection.nodeId : null;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto pr-1">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-gray-500">
          PREVIEWS
        </h3>
        <p className="text-xs text-gray-400 italic">
          How your template will appear on the canvas and as a window (when
          double clicking a node). Drag fields to reorder them, and group them
          into rows to build side-by-side layouts.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={sampleKind}
          onValueChange={(v) => {
            if (v) setSampleKind(v as FieldSampleKind);
          }}
          className="justify-start"
        >
          {SAMPLE_KINDS.map((kind) => (
            <ToggleGroupItem
              key={kind.value}
              value={kind.value}
              title={kind.title}
              className="h-7 px-3 text-xs"
            >
              {kind.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <ToggleGroup
          type="single"
          value={String(zoom)}
          onValueChange={(v) => {
            if (v) setZoom(Number(v));
          }}
          className="ml-auto justify-start"
          title="Zoom — the layout is unchanged, only the click targets grow"
        >
          {ZOOM_LEVELS.map((level) => (
            <ToggleGroupItem
              key={level}
              value={String(level)}
              className="h-7 px-2 text-xs"
            >
              {level}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* ── Node ───────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-semibold text-gray-600">Node on canvas</h4>
          <div className="ml-auto flex items-center gap-2">
            <Label className="shrink-0 text-xs text-gray-400">Size</Label>
            <Input
              type="number"
              min={60}
              value={draft.defaultDimensions.width}
              onChange={(e) =>
                onChangeDimensions({ width: Number(e.target.value) || 60 })
              }
              className="h-7 w-16"
            />
            <span className="text-xs text-gray-400">×</span>
            <Input
              type="number"
              min={33}
              value={draft.defaultDimensions.height}
              onChange={(e) =>
                onChangeDimensions({ height: Number(e.target.value) || 33 })
              }
              className="h-7 w-16"
            />
            <Label className="shrink-0 text-xs text-gray-400">Resizable</Label>
            <Switch
              checked={draft.defaultDimensions.resizable !== false}
              onCheckedChange={(checked) =>
                onChangeDimensions({ resizable: checked })
              }
            />
          </div>
        </div>

        {selection?.surface === "node" && (
          <Breadcrumb
            tree={draft.nodeLayout}
            fields={draft.fields}
            nodeId={selection.nodeId}
            onSelect={(nodeId) => onSelect("node", nodeId)}
          />
        )}

        <div
          className="flex justify-center rounded-md border border-gray-200 p-6"
          style={CANVAS_BACKDROP}
        >
          <div
            className={cn(
              "overflow-hidden rounded-md border",
              color?.bg ?? "bg-slate-100",
              color?.border ?? "border-slate-300",
            )}
            style={{
              width: draft.defaultDimensions.width,
              minHeight: draft.defaultDimensions.height,
              zoom,
            }}
          >
            <EditableSurface
              tree={draft.nodeLayout}
              fields={draft.fields}
              values={values}
              surface="node"
              selectedId={selectedIdFor("node")}
              onSelect={(nodeId) => onSelect("node", nodeId)}
              onChangeTree={(tree) => onChangeTree("node", tree)}
              hoveredId={hoveredId}
              onHover={onHover}
            />
          </div>
        </div>
      </div>

      {/* ── Window ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-semibold text-gray-600">Window</h4>
          <div className="ml-auto flex items-center gap-2">
            <Label className="shrink-0 text-xs text-gray-400">
              Can be open in window
            </Label>
            <Switch
              checked={draft.windowLayout !== undefined}
              onCheckedChange={onToggleWindow}
            />
          </div>
        </div>

        {draft.windowLayout && selection?.surface === "window" && (
          <Breadcrumb
            tree={draft.windowLayout}
            fields={draft.fields}
            nodeId={selection.nodeId}
            onSelect={(nodeId) => onSelect("window", nodeId)}
          />
        )}

        {draft.windowLayout ? (
          <div
            className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm"
            style={{ width: 420, zoom }}
          >
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <Icon size={14} className="text-gray-500" />
              <span className="truncate text-sm font-medium">{draft.name}</span>
            </div>
            <div className="min-h-24">
              <EditableSurface
                tree={draft.windowLayout}
                fields={draft.fields}
                values={values}
                surface="window"
                selectedId={selectedIdFor("window")}
                onSelect={(nodeId) => onSelect("window", nodeId)}
                onChangeTree={(tree) => onChangeTree("window", tree)}
                hoveredId={hoveredId}
                onHover={onHover}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            This template cannot be opened in a window.
          </p>
        )}
      </div>
    </div>
  );
}
