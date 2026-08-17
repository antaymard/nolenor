import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/shadcn/button";
import TemplatesList from "@/components/settings/templates/TemplatesList";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { guardDevOnlySettingsRoute } from "@/lib/featureFlags";
import { TbPlus } from "react-icons/tb";

export const Route = createFileRoute("/settings/templates")({
  beforeLoad: guardDevOnlySettingsRoute,
  component: TemplatesSettingsPage,
});

// Liste seule : l'édition se fait dans la modale plein écran (montée à la
// racine), la même que celle ouverte depuis un clic droit sur un custom node.
// Une seule surface d'édition à faire évoluer, et le builder n'est plus
// coincé dans la colonne de droite des settings.
function TemplatesSettingsPage() {
  const templates = useQuery(api.nodeTemplates.listMine, {
    includeArchived: true,
  });
  const { openTemplateEditor, openTemplateCreator } = useTemplateEditor();

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Custom nodes</h1>
        <Button type="button" size="icon-sm" onClick={openTemplateCreator}>
          <TbPlus />
        </Button>
      </div>
      <p className="max-w-2xl text-sm text-gray-500">
        Design your own node types from a library of fields, with a layout for
        the canvas and another for the window. Nolë can read and write them
        like any other node.
      </p>
      <div className="max-w-2xl flex-1 overflow-y-auto pr-1">
        {templates === undefined ? (
          <p className="px-2 text-sm text-gray-500 italic">Loading…</p>
        ) : (
          <TemplatesList templates={templates} onSelect={openTemplateEditor} />
        )}
      </div>
    </div>
  );
}
