import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import SkillsList from "@/components/settings/skills/SkillsList";
import SkillEditor from "@/components/settings/skills/SkillEditor";
import { TbPlus } from "react-icons/tb";

export const Route = createFileRoute("/settings/skills")({
  component: SkillsSettingsPage,
});

function SkillsSettingsPage() {
  const skills = useQuery(api.skills.list);
  const [selectedId, setSelectedId] = useState<Id<"skills"> | null>(null);
  const [draftSkill, setDraftSkill] = useState<{
    name: string;
    description: string;
    content: string;
  } | null>(null);

  const handleNewSkill = () => {
    setDraftSkill({
      name: "",
      description: "",
      content: "",
    });
    setSelectedId(null);
  };

  const handleCreated = (newId: Id<"skills">) => {
    setDraftSkill(null);
    setSelectedId(newId);
  };

  const handleDeleted = () => {
    setSelectedId(null);
  };

  return (
    <div className="grid grid-cols-[320px_1fr] gap-6 h-full">
      <div className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Skills</h1>
          <Button type="button" size="icon-sm" onClick={handleNewSkill}>
            <TbPlus />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Skills are reusable prompt modules Nolë can load on demand. Define the
          name, description, and body for discovery and usage.
        </p>
        <div className="overflow-y-auto pr-1 flex-1">
          {skills === undefined ? (
            <p className="text-sm text-muted-foreground italic px-2">Loading…</p>
          ) : (
            <SkillsList
              skills={skills}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      <div className="border-l border-border pl-6 min-h-0">
        {draftSkill ? (
          <SkillEditor draftSkill={draftSkill} onCreated={handleCreated} />
        ) : selectedId ? (
          <SkillEditor skillId={selectedId} onDeleted={handleDeleted} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a skill on the left, or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}
