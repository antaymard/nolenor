import type { BaseFieldProps } from "@/types/ui";
import type { Value } from "platejs";
import { RiFileList3Line } from "react-icons/ri";

interface DocumentNameFieldProps extends BaseFieldProps<{ doc: Value }> {
  documentTitle?: string;
}

export default function DocumentNameField({ field }: DocumentNameFieldProps) {
  return (
    <div className="flex h-8 gap-2 items-center p-2 rounded-md bg-muted hover:bg-accent">
      <RiFileList3Line size={16} />
      {field?.name || "Document"}
    </div>
  );
}
