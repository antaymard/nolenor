import type { Id } from "@/types";
import useRichQuery from "@/components/utils/useRichQuery";
import { api } from "@/../convex/_generated/api";
import { BlockNoteReadOnlyView } from "@/components/blocknote/BlockNoteReadOnlyView";
import { TablePreview, type TableData } from "@/components/table";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { useNodeData } from "@/hooks/useNodeData";
import { useTemplate } from "@/stores/templatesStore";
import type { LayoutContainer } from "@/../convex/config/templateConfig";

/**
 * Aperçu du snapshot d'une version. Les `values` (potentiellement volumineuses)
 * ne sont rapatriées que pour la version sélectionnée.
 *
 * Extrait de `VersionHistoryViewer` pour être réutilisé par le panel latéral
 * (aperçu en place, sans dialog) sans dupliquer le switch par type.
 */
export function VersionContentPreview({
  versionId,
}: {
  versionId: Id<"nodeDataVersions">;
}) {
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.read,
    { versionId },
  );

  // Custom nodes : le template (layout + noms de champs) vient du nodeData
  // vivant — les versions ne stockent que les values. Hooks inconditionnels.
  const liveNodeData = useNodeData(data?.nodeDataId);
  const template = useTemplate(liveNodeData?.templateId);

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  if (!isSuccess || !data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Preview unavailable.
      </div>
    );
  }

  switch (data.nodeType) {
    case "blocknote": {
      const parsed = parseStoredBlockNoteDocument(data.values.doc);
      if (!parsed || parsed.length === 0) {
        return (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Empty document.
          </div>
        );
      }
      return (
        /*
          Un vrai BlockNote en lecture seule, et non le rendu statique du
          canvas : l'aperçu prend la place de l'éditeur dans le corps de la
          fenêtre, donc comparer une version à l'actuelle revient à comparer
          deux rendus — ils doivent être le même. Le rendu statique existe pour
          le canvas, qui ne peut pas monter un éditeur par node ; ici il n'y en
          a qu'un à l'écran.
        */
        <div className="h-full min-h-0 overflow-auto">
          <BlockNoteReadOnlyView blocks={parsed} />
        </div>
      );
    }
    case "table": {
      const table = data.values.table as TableData | undefined;
      return (
        <div className="h-full min-h-0 overflow-auto">
          {/*
            La hauteur de ligne enregistrée, mais PAS les filtres : l'historique
            est une vue d'inspection, on veut y voir toutes les lignes stockées.
          */}
          <TablePreview
            columns={table?.columns ?? []}
            rows={table?.rows ?? []}
            rowHeight={table?.rowHeight}
          />
        </div>
      );
    }
    case "custom": {
      if (!template) {
        return (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Preview unavailable (template not resolved).
          </div>
        );
      }
      return (
        <div className="h-full min-h-0 overflow-auto p-2">
          <LayoutRenderer
            tree={
              (template.windowLayout ?? template.nodeLayout) as LayoutContainer
            }
            fields={template.fields}
            values={data.values}
            surface="window"
          />
        </div>
      );
    }
    default:
      return (
        <div className="flex h-full items-center justify-center text-xs text-slate-400">
          No preview available for this type.
        </div>
      );
  }
}
