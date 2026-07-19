import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import TemplatesList from "@/components/settings/templates/TemplatesList";
import TemplateEditor from "@/components/settings/templates/TemplateEditor";
import { TbPlus } from "react-icons/tb";

export const Route = createFileRoute("/settings/templates")({
  component: TemplatesSettingsPage,
});

function TemplatesSettingsPage() {
  const templates = useQuery(api.nodeTemplates.listMine, {
    includeArchived: true,
  });
  const [selectedId, setSelectedId] = useState<Id<"nodeTemplates"> | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);

  const selected = templates?.find((t) => t._id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 h-full">
      <div className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Custom nodes</h1>
          <Button
            type="button"
            size="icon-sm"
            onClick={() => {
              setIsCreating(true);
              setSelectedId(null);
            }}
          >
            <TbPlus />
          </Button>
        </div>
        <p className="text-sm text-gray-500">
          Design your own node types from a library of fields, with a layout
          for the canvas and another for the window. Nolë can read and write
          them like any other node.
        </p>
        <div className="overflow-y-auto pr-1 flex-1">
          {templates === undefined ? (
            <p className="text-sm text-gray-500 italic px-2">Loading…</p>
          ) : (
            <TemplatesList
              templates={templates}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setIsCreating(false);
              }}
            />
          )}
        </div>
      </div>

      <div className="border-l border-gray-200 pl-6 min-h-0">
        {isCreating ? (
          <TemplateEditor
            key="new"
            onCreated={(id) => {
              setIsCreating(false);
              setSelectedId(id);
            }}
          />
        ) : selected ? (
          <TemplateEditor key={selected._id} template={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Select a template on the left, or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}
