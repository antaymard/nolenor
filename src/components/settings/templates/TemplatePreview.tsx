import { useMemo } from "react";
import nodeColors from "@/components/nodes/nodeColors";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { getSelectChoices } from "@/../convex/config/fieldConfig";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import type { TemplateDraft } from "./templateDraft";

// Valeurs d'exemple pour la preview (jamais persistées).
function buildSampleValues(fields: TemplateField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field.type) {
      case "short_text":
        values[field.id] = `Sample ${field.name.toLowerCase()}`;
        break;
      case "number":
        values[field.id] = 42;
        break;
      case "date":
        values[field.id] = new Date().toISOString().slice(0, 10);
        break;
      case "select": {
        const first = getSelectChoices(field)[0];
        values[field.id] = first ? [first.id] : [];
        break;
      }
      case "boolean":
        values[field.id] = true;
        break;
      case "rich_text":
        values[field.id] = JSON.stringify([
          { type: "p", children: [{ text: `Sample ${field.name} content.` }] },
        ]);
        break;
      case "image":
        // Pas d'image d'exemple : la preview montre l'état vide du champ.
        break;
    }
  }
  return values;
}

export default function TemplatePreview({ draft }: { draft: TemplateDraft }) {
  const values = useMemo(() => buildSampleValues(draft.fields), [draft.fields]);

  const color = nodeColors[(draft.color as colorsEnum) ?? "default"];
  const Icon = getTemplateIcon(draft.icon);

  return (
    <div className="flex flex-col gap-6 min-h-0 overflow-y-auto">
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
