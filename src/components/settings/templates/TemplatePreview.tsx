import { useMemo, useState } from "react";
import nodeColors from "@/components/nodes/nodeColors";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import {
  buildSampleValues,
  type FieldSampleKind,
} from "@/components/fields/registry/fieldSamples";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import type { LayoutContainer } from "@/../convex/config/templateConfig";
import EditableSurface from "./EditableSurface";
import type {
  LayoutSelection,
  LayoutSurface,
  TemplateDraft,
} from "./templateDraft";

// Les deux aperçus, rendus éditables. C'est la surface de travail : on
// manipule la maquette elle-même, il n'y a plus de vue structurelle à mettre
// en regard.
//
// Les valeurs d'exemple vivent dans fieldSamples (registry) : un Record par
// type de champ, donc vérifié par le compilateur. Ce fichier ne connaît plus
// aucun type de champ en particulier.

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
// dnd-kit, là où zoom laisse les coordonnées de hit-test cohérentes. La
// disposition reste exacte, seules les cibles grossissent.
const ZOOM_LEVELS = [1, 1.5, 2];

type TemplatePreviewProps = {
  draft: TemplateDraft;
  selection: LayoutSelection;
  onSelect: (surface: LayoutSurface, nodeId: string) => void;
  onChangeTree: (surface: LayoutSurface, tree: LayoutContainer) => void;
};

export default function TemplatePreview({
  draft,
  selection,
  onSelect,
  onChangeTree,
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
    <div className="flex flex-col gap-6 min-h-0 overflow-auto">
      <div className="flex items-center gap-2 flex-wrap">
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
          className="justify-start ml-auto"
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

      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">
          Node preview
        </h3>
        <div
          className={cn(
            "rounded-md border overflow-hidden",
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
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">
          Window preview
        </h3>
        {draft.windowLayout ? (
          <div
            className="rounded-lg border border-gray-300 shadow-sm bg-white overflow-hidden"
            style={{ width: 420, zoom }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
              <Icon size={14} className="text-gray-500" />
              <span className="text-sm font-medium truncate">
                {draft.name}
              </span>
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
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            This template cannot be opened in a window (no window layout).
          </p>
        )}
      </div>
    </div>
  );
}
