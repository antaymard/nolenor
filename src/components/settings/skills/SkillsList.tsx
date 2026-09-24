import { cn } from "@/lib/utils";
import type { Doc } from "@/../convex/_generated/dataModel";

type SkillSummary = {
  _id: Doc<"skills">["_id"];
  name: string;
  description: string;
};

type SkillsListProps = {
  skills: SkillSummary[];
  selectedId: SkillSummary["_id"] | null;
  onSelect: (id: SkillSummary["_id"]) => void;
};

export default function SkillsList({
  skills,
  selectedId,
  onSelect,
}: SkillsListProps) {
  if (skills.length === 0) {
    return <p className="text-sm text-slate-500 italic px-2">No skills yet.</p>;
  }

  return (
    <div className="space-y-1">
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white overflow-hidden">
        {skills.map((skill) => (
          <button
            key={skill._id}
            type="button"
            onClick={() => onSelect(skill._id)}
            className={cn(
              "w-full text-left p-3 hover:bg-slate-100 transition-colors flex flex-col gap-1",
              selectedId === skill._id && "bg-violet-50 hover:bg-violet-100",
            )}
          >
            <span className="font-medium truncate">{skill.name}</span>
            <span className="text-sm text-slate-500 line-clamp-2">
              {skill.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { SkillSummary };
