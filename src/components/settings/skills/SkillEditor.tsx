import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { toastError } from "@/components/utils/errorUtils";
import { parseSkillFrontmatter } from "@/../convex/lib/parseSkillFrontmatter";
import SkillAttachments from "./SkillAttachments";
import { buildRawSkillContent } from "./skillSerialization";
import { Textarea } from "@/components/shadcn/textarea";

type SkillEditorProps = {
  skillId?: Id<"skills"> | null;
  draftSkill?: { name: string; description: string; content: string } | null;
  onDeleted?: () => void;
  onCreated?: (skillId: Id<"skills">) => void;
};

export default function SkillEditor({
  skillId,
  draftSkill,
  onDeleted,
  onCreated,
}: SkillEditorProps) {
  const skill = useQuery(api.skills.read, skillId ? { skillId } : "skip");
  const updateSkill = useMutation(api.skills.update);
  const removeSkill = useMutation(api.skills.remove);
  const createSkill = useMutation(api.skills.create);

  const isDraft = !skillId && draftSkill;
  const isExisting = !!skillId && skill;

  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [hydratedFor, setHydratedFor] = useState<Id<"skills"> | string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isDraft && draftSkill && hydratedFor !== "draft") {
      setDraftName(draftSkill.name);
      setDraftDescription(draftSkill.description);
      setDraftContent(draftSkill.content);
      setHydratedFor("draft");
    }
  }, [isDraft, draftSkill, hydratedFor]);

  useEffect(() => {
    if (isExisting && skill && hydratedFor !== skill._id) {
      const { meta, body } = parseSkillFrontmatter(skill.content);
      setDraftName(meta.name || skill.name);
      setDraftDescription(meta.description || skill.description);
      setDraftContent(body);
      setHydratedFor(skill._id);
    }
  }, [isExisting, skill, hydratedFor]);

  if (isExisting && skill === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (isExisting && skill === null) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Skill not found.
      </div>
    );
  }

  if (!isDraft && !isExisting) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a skill on the left, or create a new one.
      </div>
    );
  }

  const currentSkill =
    skill ||
    (isDraft ? { name: draftName, description: draftDescription } : null);

  const handleSave = async () => {
    if (!draftName.trim()) {
      toast.error("Skill name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const rawContent = buildRawSkillContent({
        name: draftName.trim(),
        description: draftDescription.trim(),
        body: draftContent,
      });

      if (isDraft) {
        const newId = await createSkill({ rawContent });
        toast.success("Skill created.");
        onCreated?.(newId);
      } else if (skillId) {
        await updateSkill({ skillId, rawContent });
        toast.success("Skill saved.");
      }
    } catch (error) {
      toastError(
        error,
        isDraft ? "Failed to create skill." : "Failed to save skill.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDraft) return;
    if (
      !confirm(`Delete skill "${currentSkill?.name}"? This cannot be undone.`)
    ) {
      return;
    }
    try {
      if (skillId) {
        await removeSkill({ skillId });
        toast.success(`Skill "${currentSkill?.name}" deleted.`);
        onDeleted?.();
      }
    } catch (error) {
      toastError(error, "Failed to delete skill.");
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold">
            {currentSkill?.name || "New skill"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {currentSkill?.description || "No description yet"}
          </p>
          {isDraft && (
            <span className="mt-1 inline-block self-start uppercase tracking-wide bg-(--brand)/10 text-(--brand) px-2 py-0.5 rounded">
              Draft (unsaved)
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
            {!isDraft && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive/80"
                onClick={handleDelete}
              >
                Delete
              </Button>
            )}
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Name Field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="skill-name" className="font-semibold text-foreground">
          Name
        </label>
        <Input
          id="skill-name"
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="e.g. my_skill"
          className="font-mono"
        />
      </div>

      {/* Description Field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="skill-description"
          className="font-semibold text-foreground"
        >
          Description
        </label>
        <Textarea
          id="skill-description"
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Short description used to match this skill"
          className=""
        />
      </div>

      {/* Content Field */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <label htmlFor="skill-content" className="font-semibold text-foreground">
          Content
        </label>
        <textarea
          id="skill-content"
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          placeholder="The full prompt body loaded by Nolë…"
          className="w-full font-mono border rounded-md px-3 py-2 bg-card flex-1 resize-none"
        />
        <p className="text-xs text-muted-foreground">
          The body is the full prompt loaded by Nolë. Markdown format supported.
        </p>
      </div>

      {/* Attachments Section (only for saved skills) */}
      {isExisting && skill && (
        <SkillAttachments
          skillId={skill._id}
          attachments={skill.attachments}
        />
      )}
    </div>
  );
}
