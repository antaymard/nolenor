import { TbBrain, TbCheck, TbPhoto } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ChatModelOption, ChatModelValues } from "@/types/convex";

type ModelSelectProps = {
  modelOptions: readonly ChatModelOption[] | undefined;
  selectedModel: ChatModelValues | undefined;
  setSelectedModel: (model: ChatModelValues) => void;
  /** Disable while a message is sending / the assistant is responding. */
  disabled?: boolean;
  triggerClassName?: string;
  iconSize?: number;
};

/**
 * Brain-icon dropdown to pick the chat model. Shared by the desktop and mobile
 * composers — only the trigger sizing differs.
 */
export default function ModelSelect({
  modelOptions,
  selectedModel,
  setSelectedModel,
  disabled,
  triggerClassName,
  iconSize = 12,
}: ModelSelectProps) {
  const hasNoModels = (modelOptions?.length ?? 0) === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || hasNoModels}
          className={cn("text-muted-foreground", triggerClassName)}
        >
          <TbBrain size={iconSize} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(modelOptions ?? []).map((model) => (
          <DropdownMenuItem
            key={model.value}
            onSelect={() => setSelectedModel(model.value)}
            className={cn(
              selectedModel === model.value && "font-medium",
              "capitalize flex items-center justify-between",
            )}
          >
            <span className="flex items-center gap-1.5">
              <p>{model.label}</p>
              {model.isMultimodal && (
                <TbPhoto size={8} className="text-muted-foreground/70" />
              )}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {model.price.replace("_", " - ")}
            </span>
            {selectedModel === model.value && <TbCheck />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
