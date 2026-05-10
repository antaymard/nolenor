import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { toastError } from "@/components/utils/errorUtils";

type AttachmentSummary = {
  _id: Id<"skillAttachments">;
  name: string;
  type: Doc<"skillAttachments">["type"];
};

type AttachmentType = Doc<"skillAttachments">["type"];

const ATTACHMENT_TYPES: { value: AttachmentType; label: string }[] = [
  { value: "md", label: "Markdown (.md)" },
  { value: "txt", label: "Plain text (.txt)" },
  { value: "script_py", label: "Python script (.py)" },
  { value: "script_ts", label: "TypeScript script (.ts)" },
];

type SkillAttachmentsProps = {
  skillId: Id<"skills">;
  attachments: AttachmentSummary[];
};

export default function SkillAttachments({
  skillId,
  attachments,
}: SkillAttachmentsProps) {
  const addAttachment = useMutation(api.skills.addAttachment);
  const removeAttachment = useMutation(api.skills.removeAttachment);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AttachmentType>("md");
  const [newContent, setNewContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setNewName("");
    setNewType("md");
    setNewContent("");
    setShowForm(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error("Attachment name is required.");
      return;
    }
    setIsSaving(true);
    try {
      await addAttachment({
        skillId,
        name: newName.trim(),
        content: newContent,
        type: newType,
      });
      toast.success(`Attachment "${newName.trim()}" added.`);
      resetForm();
    } catch (error) {
      toastError(error, "Failed to add attachment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (
    attachmentId: Id<"skillAttachments">,
    name: string,
  ) => {
    if (!confirm(`Remove attachment "${name}"?`)) return;
    try {
      await removeAttachment({ attachmentId });
      toast.success(`Attachment "${name}" removed.`);
    } catch (error) {
      toastError(error, "Failed to remove attachment.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Attachments ({attachments.length})
        </h3>
        {!showForm && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowForm(true)}
          >
            Add attachment
          </Button>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No attachments.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md bg-white">
          {attachments.map((attachment) => (
            <li
              key={attachment._id}
              className="flex items-center justify-between px-3 py-2 gap-2"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">
                  {attachment.name}
                </span>
                <span className="text-xs text-gray-500">{attachment.type}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={() => handleRemove(attachment._id, attachment.name)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attachment-name">Name</Label>
            <Input
              id="attachment-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. extractor.py"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attachment-type">Type</Label>
            <Select
              value={newType}
              onValueChange={(value) => setNewType(value as AttachmentType)}
            >
              <SelectTrigger id="attachment-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTACHMENT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attachment-content">Content</Label>
            <textarea
              id="attachment-content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Paste the attachment content here…"
              className="w-full font-mono border rounded-md px-3 py-2 bg-white min-h-40"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAdd} disabled={isSaving}>
              {isSaving ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
