import type { BaseFieldProps } from "@/types/ui";
import { useCallback, useState } from "react";
import { useNodeSidePanel } from "../nodes/side-panels/NodeSidePanelContext";
import SidePanelFrame from "../nodes/side-panels/SidePanelFrame";
import { Button } from "@/components/shadcn/button";
import colors from "@/components/nodes/nodeColors";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import { HiCheck } from "react-icons/hi2";

export type SelectFieldType = {
  selectedOptions: string[];
};

const sidePanelId = "selectEdition";

interface SelectFieldProps extends BaseFieldProps<SelectFieldType> {
  className?: string;
}

export default function SelectField({
  field,
  value,
  onChange,
  visualSettings,
  className = "",
}: SelectFieldProps) {
  const { closeSidePanel, openSidePanel } = useNodeSidePanel();

  const selectedOptions = (value && value?.selectedOptions) || [];
  const { isMultipleSelect, selectChoices } = (field && field.options) || {};

  const handleSave = useCallback((newValue: SelectFieldType) => {
    onChange?.(newValue);
    closeSidePanel(sidePanelId);
  }, []);

  return (
    <div
      className={
        "relative border border-transparent hover:border-border h-8 rounded-md flex items-center group/linkfield w-full px-2 gap-2 min-w-0 flex-1" +
        className
      }
      onClick={() =>
        openSidePanel(
          sidePanelId,
          <SelectSidePanel
            choices={
              selectChoices as {
                color: string;
                label: string;
                value: string;
              }[]
            }
            isMultipleSelect={isMultipleSelect as boolean}
            onSave={handleSave}
            onClose={() => closeSidePanel(sidePanelId)}
            initialSelectedOptions={selectedOptions}
          />
        )
      }
    >
      <SelectedOptionsRenderer
        isMultipleSelect={isMultipleSelect as boolean}
        selectedOptions={selectedOptions}
        choices={
          selectChoices as {
            color: string;
            label: string;
            value: string;
          }[]
        }
      />
    </div>
  );
}

function SelectSidePanel({
  choices,
  onSave,
  isMultipleSelect,
  onClose,
  initialSelectedOptions,
}: {
  choices: {
    color: string;
    label: string;
    value: string;
  }[];
  isMultipleSelect: boolean;
  onSave: (value: SelectFieldType) => void;
  onClose: () => void;
  initialSelectedOptions: string[];
}) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    initialSelectedOptions
  );

  const handleOptionClick = (optionValue: string) => {
    if (isMultipleSelect) {
      // Toggle l'option dans l'array
      setSelectedOptions((prev) =>
        prev.includes(optionValue)
          ? prev.filter((v) => v !== optionValue)
          : [...prev, optionValue]
      );
    } else {
      // Remplace la sélection (single select)
      setSelectedOptions((prev) =>
        prev.includes(optionValue) ? [] : [optionValue]
      );
    }
  };

  const handleSave = () => {
    onSave({ selectedOptions });
  };

  return (
    <SidePanelFrame
      id={sidePanelId}
      title="Edit selection"
      className="w-64"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {choices?.map((choice) => {
            const isSelected = selectedOptions.includes(choice.value);
            const colorKey = (choice.color as colorsEnum) || "default";
            const colorConfig = colors[colorKey] || colors.default;

            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => handleOptionClick(choice.value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-left transition-all",
                  "hover:bg-accent/60",
                  isSelected && colorConfig.transparentBg
                )}
              >
                <span
                  className={cn(
                    "w-3 h-3 rounded-full shrink-0",
                    colorConfig.plain
                  )}
                />
                <span className="flex-1 text-sm truncate">{choice.label}</span>
                {isSelected && (
                  <HiCheck
                    className={cn("w-4 h-4 shrink-0", colorConfig.text)}
                  />
                )}
              </button>
            );
          })}
        </div>

        {(!choices || choices.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Aucune option disponible
          </p>
        )}

        <Button type="button" onClick={handleSave} className="mt-2">
          Enregistrer
        </Button>
      </div>
    </SidePanelFrame>
  );
}

function SelectedOptionsRenderer({
  isMultipleSelect,
  selectedOptions,
  choices,
}: {
  isMultipleSelect: boolean;
  selectedOptions: string[];
  choices: {
    color: string;
    label: string;
    value: string;
  }[];
}) {
  if (selectedOptions.length === 0) {
    return <p className="text-muted-foreground">-</p>;
  }

  // Single select : prend toute la place, pas arrondi
  if (!isMultipleSelect) {
    const choice = choices?.find((c) => c.value === selectedOptions[0]);
    if (!choice) return <p className="text-muted-foreground">-</p>;
    const colorKey = (choice.color as colorsEnum) || "default";
    const colorConfig = colors[colorKey] || colors.default;

    return (
      <div
        className={cn(
          "absolute inset-0 flex items-center gap-2 px-2 text-sm rounded-sm",
          colorConfig.transparentBg,
          colorConfig.text
        )}
      >
        <span
          className={cn("w-2 h-2 rounded-full shrink-0", colorConfig.plain)}
        />
        <span className="truncate">{choice.label}</span>
      </div>
    );
  }

  // Multiple select : badges arrondis
  return (
    <div className="flex flex-wrap gap-1">
      {selectedOptions.map((optionValue) => {
        const choice = choices?.find((c) => c.value === optionValue);
        if (!choice) return null;
        const colorKey = (choice.color as colorsEnum) || "default";
        const colorConfig = colors[colorKey] || colors.default;

        return (
          <span
            key={optionValue}
            className={cn(
              "px-2 py-0.5 rounded-full text-sm flex items-center gap-1",
              colorConfig.transparentBg,
              colorConfig.text
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", colorConfig.plain)} />
            {choice.label}
          </span>
        );
      })}
    </div>
  );
}
