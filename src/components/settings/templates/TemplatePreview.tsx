import { useMemo, useState } from "react";
import { TbChevronRight } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Switch } from "@/components/shadcn/switch";
import {
  buildSampleValues,
  type FieldSampleKind,
} from "@/components/fields/registry/fieldSamples";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type {
  LayoutContainer,
  LayoutNode,
} from "@/../convex/config/templateConfig";
import LayoutAddButtons from "./LayoutAddButtons";
import EditableSurface from "./EditableSurface";
import {
  findLayoutNode,
  getAncestorPath,
  layoutNodeLabel,
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
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(to right, rgba(226, 232, 240, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(226, 232, 240, 0.35) 1px, transparent 1px)",
  backgroundSize: "20px 20px",
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
  // `atRoot` doit figurer ICI : sans lui, TypeScript accepte silencieusement
  // le passage à `onAdd` (une fonction à moins de paramètres est assignable),
  // et la sortie de secours du menu ne serait plus vérifiée par le compilateur.
  onAddNode: (
    surface: LayoutSurface,
    node: LayoutNode,
    atRoot?: boolean,
  ) => void;
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
    return found ? layoutNodeLabel(found, fields) : "?";
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
  onAddNode,
}: TemplatePreviewProps) {
  const [sampleKind, setSampleKind] = useState<FieldSampleKind>("filled");
  const [zoom, setZoom] = useState(1);

  const values = useMemo(
    () => buildSampleValues(draft.fields, sampleKind),
    [draft.fields, sampleKind],
  );

  const Icon = getTemplateIcon(draft.icon);

  const selectedIdFor = (surface: LayoutSurface) =>
    selection?.surface === surface ? selection.nodeId : null;

  return (
    <div
      className="flex min-h-0 flex-col gap-4 overflow-auto py-4"
      style={CANVAS_BACKDROP}
    >
      <div className="px-5 ">
        <h3 className="text-md font-bold">PREVIEWS</h3>
        <p className="text-[10px] opacity-60 leading-tight">
          How your template will appear on the canvas and as a window (when
          double clicking a node). Drag fields to reorder them, and group them
          into rows to build side-by-side layouts.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 border-b border-slate-200 pb-4">
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
              className="h-7 px-3 text-xs border border-slate-200 border-r-0 last-of-type:border-r"
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
              className="h-7 px-2 text-xs border border-slate-200 border-r-0 last-of-type:border-r"
            >
              {level}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* ── Node ───────────────────────────────────────────────────────── */}
      <div className="space-y-2 border-b border-slate-200 px-5 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text font-bold text-slate-500">Node preview</h4>
          <p className="text-[10px] opacity-60 leading-tight">
            How it looks on the canvas.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Label className="shrink-0 text-xs">Size</Label>
            <Input
              type="number"
              min={60}
              value={draft.defaultDimensions.width}
              onChange={(e) =>
                onChangeDimensions({ width: Number(e.target.value) || 60 })
              }
              className="h-5 w-16 bg-white/60 shadow-none pt-1.5"
            />
            <span className="text-xs">×</span>
            <Input
              type="number"
              min={33}
              value={draft.defaultDimensions.height}
              onChange={(e) =>
                onChangeDimensions({ height: Number(e.target.value) || 33 })
              }
              className="h-5 w-16 bg-white/60 shadow-none pt-1.5"
            />
            <Label className="shrink-0 text-xs">Resizable</Label>
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

        <div className="flex justify-center p-6">
          {/* `relative` sur un conteneur au plus près de l'aperçu : le « + »
              est posé en absolu contre son bord droit, donc il ne participe
              pas au centrage et l'aperçu ne se décale pas d'un pixel quand il
              apparaît ou disparaît. */}
          <div className="relative">
            <div
              className={cn(
                "overflow-hidden rounded-md border bg-white border-slate-200",
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
            <div className="absolute left-full top-0 ml-2">
              <LayoutAddButtons
                surface="node"
                tree={draft.nodeLayout}
                fields={draft.fields}
                selectedId={selectedIdFor("node")}
                onAdd={onAddNode}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Window ─────────────────────────────────────────────────────── */}
      <div className="space-y-2 px-5 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text font-bold text-slate-500">Window preview</h4>
          <p className="text-[10px] opacity-60 leading-tight">
            How it looks in window mode, after a double-click on the node.
          </p>
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
          <div className="relative mx-auto mt-5 w-4/5">
            <div className="absolute left-full top-0 ml-2">
              <LayoutAddButtons
                surface="window"
                tree={draft.windowLayout}
                fields={draft.fields}
                selectedId={selectedIdFor("window")}
                onAdd={onAddNode}
              />
            </div>
            <div
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md"
              style={{ zoom }}
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
