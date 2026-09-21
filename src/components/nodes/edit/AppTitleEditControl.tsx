import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { TbPencil } from "react-icons/tb";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { WindowEditTrigger } from "./WindowEditTrigger";
import type { NodeEditTriggerVariant } from "./WindowEditTrigger";

interface AppTitleEditControlProps {
  nodeDataId: Id<"nodeDatas"> | undefined;
  variant?: NodeEditTriggerVariant;
}

/**
 * Bouton Edit + popover d'édition du titre d'une app, partagé entre la
 * toolbar du node canvas et le header des windows (flottante et plein écran).
 * Le contenu du popover vit ici une seule fois (DRY).
 */
export function AppTitleEditControl({
  nodeDataId,
  variant = "toolbar",
}: AppTitleEditControlProps) {
  const values = useNodeDataValues(nodeDataId);
  const updateValuesMutation = useMutation(api.nodeDatas.updateValues);

  const [inputTitle, setInputTitle] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleSaveTitle = useCallback(() => {
    if (!nodeDataId || !inputTitle.trim()) return;
    updateValuesMutation({
      _id: nodeDataId,
      values: { title: inputTitle.trim() },
    });
    setIsPopoverOpen(false);
    setInputTitle("");
  }, [nodeDataId, inputTitle, updateValuesMutation]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) {
        setInputTitle((values?.title as string) ?? "");
      }
    },
    [values?.title],
  );

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        {variant === "toolbar" ? (
          <NodeToolbarButton label="Edit" title="Edit app title">
            <TbPencil />
          </NodeToolbarButton>
        ) : (
          <WindowEditTrigger title="Edit app title" />
        )}
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveTitle();
          }}
        >
          <Input
            onDoubleClick={(e) => e.stopPropagation()}
            type="text"
            placeholder="Title (optional)"
            value={inputTitle}
            onChange={(e) => setInputTitle(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={!inputTitle.trim()}>
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
