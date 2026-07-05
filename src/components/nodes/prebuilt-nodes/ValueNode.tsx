import { memo, useState } from "react";
import type { Node } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Switch } from "@/components/shadcn/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { TbTag, TbCheck, TbX, TbPencil } from "react-icons/tb";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataValues } from "@/hooks/useNodeData";
import type { Id } from "@/../convex/_generated/dataModel";

export type ValueDataType = "text" | "number" | "boolean";

export type ValueType = {
  type: ValueDataType;
  value: string | number | boolean | null;
  unit: string;
  label: string;
};

const defaultValue: ValueType = {
  type: "text",
  value: null,
  unit: "",
  label: "",
};

function ValueNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  const [inputType, setInputType] = useState<ValueDataType>("text");
  const [inputValue, setInputValue] = useState("");
  const [inputBoolean, setInputBoolean] = useState(false);
  const [inputUnit, setInputUnit] = useState("");
  const [inputLabel, setInputLabel] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const valueData = (values?.value as ValueType | undefined) ?? defaultValue;

  const handleSave = () => {
    if (!nodeDataId) return;

    let parsedValue: string | number | boolean | null = null;

    if (inputType === "boolean") {
      parsedValue = inputBoolean;
    } else if (inputType === "number") {
      const trimmed = inputValue.trim();
      if (trimmed) {
        const asNumber = parseFloat(trimmed);
        parsedValue = isNaN(asNumber) ? null : asNumber;
      }
    } else {
      const trimmed = inputValue.trim();
      parsedValue = trimmed || null;
    }

    updateNodeDataValues({
      nodeDataId,
      values: {
        value: {
          type: inputType,
          value: parsedValue,
          unit: inputUnit.trim(),
          label: inputLabel.trim(),
        },
      },
    });
    setIsPopoverOpen(false);
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      setInputType(valueData.type ?? "text");
      if (valueData.type === "boolean") {
        setInputBoolean(valueData.value === true);
        setInputValue("");
      } else {
        setInputValue(valueData.value !== null ? String(valueData.value) : "");
        setInputBoolean(false);
      }
      setInputUnit(valueData.unit);
      setInputLabel(valueData.label);
    }
  };

  const handleTypeChange = (newType: string) => {
    if (
      newType &&
      (newType === "text" || newType === "number" || newType === "boolean")
    ) {
      setInputType(newType);
      if (newType === "boolean") {
        setInputBoolean(false);
        setInputValue("");
      } else {
        setInputValue("");
        setInputBoolean(false);
      }
    }
  };

  const hasContent = valueData?.value !== null;
  const hasUnit = valueData.unit?.length > 0;
  const hasLabel = valueData.label?.length > 0;

  const renderValue = () => {
    if (valueData.type === "boolean") {
      return valueData.value ? (
        <TbCheck className="text-emerald-500" size={32} />
      ) : (
        <TbX className="text-destructive" size={32} />
      );
    }
    return <span className="text-2xl font-bold">{valueData.value}</span>;
  };

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="Edit value">
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Type</span>
                <ToggleGroup
                  type="single"
                  value={inputType}
                  onValueChange={handleTypeChange}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <ToggleGroupItem value="text" className="flex-1">
                    Text
                  </ToggleGroupItem>
                  <ToggleGroupItem value="number" className="flex-1">
                    Number
                  </ToggleGroupItem>
                  <ToggleGroupItem value="boolean" className="flex-1">
                    Yes/No
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Value</span>
                {inputType === "boolean" ? (
                  <div className="flex items-center gap-2 py-1">
                    <Switch
                      checked={inputBoolean}
                      onCheckedChange={setInputBoolean}
                    />
                    <span className="text-sm">
                      {inputBoolean ? "Yes" : "No"}
                    </span>
                  </div>
                ) : (
                  <Input
                    onDoubleClick={(e) => e.stopPropagation()}
                    type={inputType === "number" ? "number" : "text"}
                    placeholder={inputType === "number" ? "Number" : "Text"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                )}
              </div>

              {inputType !== "boolean" && (
                <Input
                  onDoubleClick={(e) => e.stopPropagation()}
                  type="text"
                  placeholder="Unit (kg, $, %...)"
                  value={inputUnit}
                  onChange={(e) => setInputUnit(e.target.value)}
                />
              )}

              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="Label"
                value={inputLabel}
                onChange={(e) => setInputLabel(e.target.value)}
              />

              <Button onClick={handleSave} size="sm">
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        <div className="flex flex-col items-center justify-center h-full px-2">
          {hasContent ? (
            <>
              <div className="flex items-baseline gap-1">
                {renderValue()}
                {hasUnit && valueData.type !== "boolean" && (
                  <span className="text-sm text-muted-foreground">
                    {valueData.unit}
                  </span>
                )}
              </div>
              {hasLabel && (
                <span className="text-sm text-muted-foreground">
                  {valueData.label}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <TbTag size={18} />
              No value
            </span>
          )}
        </div>
      </NodeFrame>
    </>
  );
}

export default memo(ValueNode, areNodePropsEqual);
