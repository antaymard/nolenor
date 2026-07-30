import { cn } from "@/lib/utils";
import type { Doc } from "@/../convex/_generated/dataModel";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";

type TemplatesListProps = {
  templates: Doc<"nodeTemplates">[];
  // Optionnel : l'édition se faisant en modale, la liste des settings n'a
  // plus de notion de sélection persistante. Conservé pour les contextes qui
  // afficheraient la liste à côté d'une cible active.
  onSelect: (id: Doc<"nodeTemplates">["_id"]) => void;
};

function TemplateRow({
  template,
  onSelect,
}: {
  template: Doc<"nodeTemplates">;
  onSelect: () => void;
}) {
  const Icon = getTemplateIcon(template.icon);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3 hover:bg-gray-100 transition-colors flex items-center gap-2.5",
      )}
    >
      <Icon size={16} className="shrink-0 text-gray-500" />
      <span className="flex flex-col min-w-0">
        <span className="font-medium truncate">{template.name}</span>
        <span className="text-xs text-gray-500">
          {template.fields.length} field{template.fields.length > 1 ? "s" : ""}
          {template.archivedAt !== undefined && " · archived"}
        </span>
      </span>
    </button>
  );
}

export default function TemplatesList({
  templates,
  onSelect,
}: TemplatesListProps) {
  const active = templates.filter((t) => t.archivedAt === undefined);
  const archived = templates.filter((t) => t.archivedAt !== undefined);

  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic px-2">No templates yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <div className="divide-y divide-gray-200 border border-gray-200 bg-white rounded-md overflow-hidden">
          {active.map((template) => (
            <TemplateRow
              key={template._id}
              template={template}
              onSelect={() => onSelect(template._id)}
            />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1 px-1">
            Archived
          </h4>
          <div className="divide-y divide-gray-200 border border-gray-200 bg-white rounded-md overflow-hidden opacity-70">
            {archived.map((template) => (
              <TemplateRow
                key={template._id}
                template={template}
                onSelect={() => onSelect(template._id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
