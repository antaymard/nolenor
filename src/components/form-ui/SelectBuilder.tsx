import { useCallback, useMemo, memo } from "react";
import get from "lodash/get";
import { useFormikContext } from "formik";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { FieldLabel } from "@/components/shadcn/field";
import { HiPlus, HiMiniTrash } from "react-icons/hi2";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import type { colorsEnum } from "@/types/domain";
import colors from "@/components/nodes/nodeColors";

interface SelectBuilderProps {
  /**
   * Nom du champ Formik (chemin vers le tableau d'options)
   */
  name: string;

  /**
   * Label à afficher au-dessus du composant
   */
  label?: string;

  /**
   * Classes CSS pour le wrapper
   */
  className?: string;
}

interface SelectOption {
  value: string;
  label: string;
  color?: colorsEnum;
}

/**
 * Composant SelectBuilder pour créer et gérer des options de select
 * Compatible uniquement avec Formik
 *
 * Fonctionnalités:
 * - Ajouter des options avec bouton +
 * - Supprimer des options avec bouton -
 * - Édition inline des valeurs et labels
 *
 * @example
 * // Structure attendue dans Formik values:
 * // options: [{ value: "option1", label: "Option 1" }, ...]
 *
 * <SelectBuilder
 *   name="fields.0.options.selectChoices"
 *   label="Choix disponibles"
 * />
 */
export default function SelectBuilder({
  name,
  label,
  className,
}: SelectBuilderProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { values, setFieldValue } = useFormikContext<any>();

  // Récupérer le tableau d'options actuel avec useMemo
  const options = useMemo(
    () => (get(values, name) as SelectOption[]) || [],
    [values, name]
  );

  // Générer un ID unique pour la valeur
  const generateOptionValue = useCallback(() => {
    return `option_${crypto.randomUUID()}`;
  }, []);

  // Ajouter une nouvelle option
  const addOption = useCallback(() => {
    const newOption: SelectOption = {
      value: generateOptionValue(),
      label: "",
      color: "default",
    };
    const updatedOptions = [...options, newOption];
    setFieldValue(name, updatedOptions);
  }, [options, name, setFieldValue, generateOptionValue]);

  // Supprimer une option
  const removeOption = useCallback(
    (index: number) => {
      const updatedOptions = options.filter((_, i) => i !== index);
      setFieldValue(name, updatedOptions);
    },
    [options, name, setFieldValue]
  );

  // Mettre à jour le label d'une option
  const updateOptionLabel = useCallback(
    (index: number, newLabel: string) => {
      const updatedOptions = [...options];
      updatedOptions[index] = {
        ...updatedOptions[index],
        label: newLabel,
      };
      setFieldValue(name, updatedOptions);
    },
    [options, name, setFieldValue]
  );

  // Mettre à jour la couleur d'une option
  const updateOptionColor = useCallback(
    (index: number, newColor: colorsEnum) => {
      const updatedOptions = [...options];
      updatedOptions[index] = {
        ...updatedOptions[index],
        color: newColor,
      };
      setFieldValue(name, updatedOptions);
    },
    [options, name, setFieldValue]
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <FieldLabel className="text-sm font-medium">{label}</FieldLabel>
      )}

      <div className="flex flex-col gap-1">
        {options.map((option, index) => (
          <OptionRow
            key={option.value}
            option={option}
            index={index}
            onUpdateLabel={updateOptionLabel}
            onUpdateColor={updateOptionColor}
            onRemove={removeOption}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addOption}
        className="self-start"
      >
        <HiPlus size={16} />
        Add an option
      </Button>
    </div>
  );
}

// Composant mémoïsé pour chaque ligne d'option
const OptionRow = memo(
  ({
    option,
    index,
    onUpdateLabel,
    onUpdateColor,
    onRemove,
  }: {
    option: SelectOption;
    index: number;
    onUpdateLabel: (index: number, label: string) => void;
    onUpdateColor: (index: number, color: colorsEnum) => void;
    onRemove: (index: number) => void;
  }) => {
    return (
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={cn(
                "shrink-0",
                colors[option.color || "default"].plain,
                "rounded-full"
              )}
            ></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(colors) as colorsEnum[]).map((colorKey) => (
                <button
                  key={colorKey}
                  type="button"
                  onClick={() => onUpdateColor(index, colorKey)}
                  className={cn(
                    "w-8 h-8 rounded border-2 transition-all hover:scale-110",
                    colors[colorKey].plain,
                    option.color === colorKey
                      ? "border-foreground ring-2 ring-ring"
                      : "border-border"
                  )}
                  title={colors[colorKey].label}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Input
          placeholder="Option name"
          value={option.label}
          onChange={(e) => onUpdateLabel(index, e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemove(index)}
          className="shrink-0"
        >
          <HiMiniTrash size={16} />
        </Button>
      </div>
    );
  }
);
