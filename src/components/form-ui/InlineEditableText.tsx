import {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  type JSX,
} from "react";
import { cn } from "@/lib/utils";

interface InlineEditableTextProps {
  /**
   * La valeur du texte à afficher et éditer
   */
  value?: string;
  disabled?: boolean;

  /**
   * Callback appelé lors de la sauvegarde
   */
  onSave?: (value: string) => void;

  /**
   * Classes CSS pour le wrapper
   */
  className?: string;
  inputClassName?: string;

  /**
   * Placeholder quand le texte est vide
   */
  placeholder?: string;

  /**
   * Si true, sauvegarde automatiquement sur blur
   * @default true
   */
  saveOnBlur?: boolean;

  /**
   * Type d'élément HTML pour l'affichage (span, div, h1, h2, etc.)
   * @default "span"
   */
  as?: keyof JSX.IntrinsicElements;

  /**
   * Callback appelé à chaque modification du texte en mode édition
   */
  onChange?: (value: string) => void;

  /**
   * Transforme la valeur saisie avant qu'elle ne soit appliquée à l'input.
   * Retourner `undefined` pour conserver la valeur d'origine.
   * Utile pour intercepter une syntaxe (ex: `# ` markdown) et la réécrire en direct.
   */
  transformInput?: (value: string) => string | undefined;
}

/**
 * Composant de texte éditable en double-cliquant
 *
 * Fonctionnalités:
 * - Double-clic pour activer l'édition
 * - Enter pour sauvegarder
 * - Echap pour annuler
 * - Clic ailleurs pour sauvegarder (configurable avec saveOnBlur)
 *
 * @example
 * <InlineEditableText
 *   value={name}
 *   onSave={(newValue) => setName(newValue)}
 * />
 */
function InlineEditableText({
  value: externalValue,
  onSave,
  className,
  inputClassName,
  placeholder = "Click to edit...",
  saveOnBlur = true,
  as: Element = "span",
  disabled = false,
  onChange,
  transformInput,
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const currentValue = externalValue || "";

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // OPTIMISATION: useCallback empêche la recréation des handlers à chaque render
  const handleStartEdit = useCallback(() => {
    setEditValue(currentValue);
    setIsEditing(true);
  }, [currentValue]);

  const handleSave = useCallback(() => {
    if (editValue !== currentValue) {
      onSave?.(editValue);
    }
    setIsEditing(false);
  }, [editValue, currentValue, onSave]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(currentValue);
  }, [currentValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      if (transformInput) {
        const transformed = transformInput(val);
        if (transformed !== undefined) {
          val = transformed;
        }
      }
      setEditValue(val);
      onChange?.(val);
    },
    [onChange, transformInput],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  const handleBlur = useCallback(() => {
    if (saveOnBlur) {
      handleSave();
    }
  }, [saveOnBlur, handleSave]);

  return (
    <div
      className={cn("inline-grid", className)}
      style={{ gridTemplateColumns: "1fr" }}
    >
      {/* Élément invisible qui maintient la largeur */}
      <Element
        className={cn(
          "invisible col-start-1 row-start-1",
          "whitespace-normal",
          !currentValue && "text-muted-foreground/50 italic",
        )}
        aria-hidden="true"
      >
        {(isEditing ? editValue : currentValue) || placeholder}
      </Element>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            "col-start-1 row-start-1 bg-transparent border-none outline-none nodrag",
            inputClassName,
          )}
          style={{
            font: "inherit",
            padding: 0,
            margin: 0,
          }}
        />
      ) : (
        <Element
          className={cn(
            "col-start-1 row-start-1 cursor-text",
            !currentValue && "text-muted-foreground/50 italic",
          )}
          onDoubleClick={(e) => {
            if (disabled) return;
            e.stopPropagation();
            handleStartEdit();
          }}
        >
          {currentValue || placeholder}
        </Element>
      )}
    </div>
  );
}

export default memo(InlineEditableText);
