import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import SkillsList from "@/components/settings/skills/SkillsList";
import SkillEditor from "@/components/settings/skills/SkillEditor";
import { cn } from "@/lib/utils";
import { TbArrowLeft, TbPlus } from "react-icons/tb";

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

  // Sur mobile les deux colonnes ne tiennent pas côte à côte : on montre la
  // liste, puis l'éditeur seul dès qu'une skill est ouverte, avec un retour.
  // En CSS plutôt qu'avec un breakpoint en JS, pour que le desktop garde ses
  // deux colonnes sans dépendre d'un état de rendu.
  const isEditing = draftSkill !== null || selectedId !== null;

  const closeEditor = () => {
    setDraftSkill(null);
    setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 md:grid md:grid-cols-[320px_1fr] md:gap-6">
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3",
          isEditing && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Skills</h1>
          <Button type="button" size="icon-sm" onClick={handleNewSkill}>
            <TbPlus />
          </Button>
        </div>
        <p className="text-sm text-gray-500">
          Skills are reusable prompt modules Nolë can load on demand. Define the
          name, description, and body for discovery and usage.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {skills === undefined ? (
            <p className="text-sm text-gray-500 italic px-2">Loading…</p>
          ) : (
            <SkillsList
              skills={skills}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 md:border-l md:border-gray-200 md:pl-6",
          !isEditing && "hidden md:flex",
        )}
      >
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start md:hidden"
            onClick={closeEditor}
          >
            <TbArrowLeft /> All skills
          </Button>
        )}
        <div className="min-h-0 flex-1">
          {draftSkill ? (
            <SkillEditor draftSkill={draftSkill} onCreated={handleCreated} />
          ) : selectedId ? (
            <SkillEditor skillId={selectedId} onDeleted={handleDeleted} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a skill on the left, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
