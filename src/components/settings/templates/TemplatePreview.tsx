import { useMemo, useState } from "react";
import nodeColors from "@/components/nodes/nodeColors";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import {
  buildSampleValues,
  type FieldSampleKind,
} from "@/components/fields/registry/fieldSamples";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import type { TemplateDraft } from "./templateDraft";

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

export default function TemplatePreview({ draft }: { draft: TemplateDraft }) {
  const [sampleKind, setSampleKind] = useState<FieldSampleKind>("filled");

  const values = useMemo(
    () => buildSampleValues(draft.fields, sampleKind),
    [draft.fields, sampleKind],
  );

  const color = nodeColors[(draft.color as colorsEnum) ?? "default"];
  const Icon = getTemplateIcon(draft.icon);

  return (
    <div className="flex flex-col gap-6 min-h-0 overflow-y-auto">
      {/* Contrôle volontairement minimal : la mise en page de l'éditeur est
          en attente de conception, la couche de données lui survivra. */}
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
            maxWidth: "100%",
          }}
        >
          <LayoutRenderer
            tree={draft.nodeLayout}
            fields={draft.fields}
            values={values}
            surface="node"
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
            style={{ maxWidth: "100%", width: 420 }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
              <Icon size={14} className="text-gray-500" />
              <span className="text-sm font-medium truncate">
                {draft.name}
              </span>
            </div>
            <div className="min-h-24">
              <LayoutRenderer
                tree={draft.windowLayout}
                fields={draft.fields}
                values={values}
                surface="window"
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
