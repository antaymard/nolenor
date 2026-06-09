import { memo, useEffect, useId, useRef } from "react";
import { Label } from "@/components/shadcn/label";
import { cn } from "@/lib/utils";
import { Textarea } from "../shadcn/textarea";

// Type simplifié pour le form TanStack (les types réels sont très complexes)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TanStackFormApi = any;

interface TextAreaProps {
  form: TanStackFormApi;
  name: string;
  label?: string;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  minRows?: number;
  maxRows?: number;
  className?: string;
  disabled?: boolean;
  validators?: object;
}

/**
 * Composant TextArea qui fonctionne avec TanStack Form
 * Auto-resize en fonction du contenu
 *
 * @example
 * ```tsx
 * const form = useForm({
 *   defaultValues: { description: "" },
 *   onSubmit: (values) => console.log(values),
 * });
 *
 * <TextArea
 *   form={form}
 *   name="description"
 *   label="Description"
 *   placeholder="Entrez une description..."
 *   minRows={3}
 *   maxRows={10}
 * />
 * ```
 */
function TextArea({
  form,
  name,
  label,
  placeholder,
  helperText,
  required = false,
  minRows = 3,
  maxRows = 10,
  className,
  disabled = false,
}: TextAreaProps) {
  const generatedId = useId();
  const id = `textarea-${name}-${generatedId}`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Fonction d'auto-resize
  const autoResize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset la hauteur pour recalculer
    textarea.style.height = "auto";

    // Calcule la hauteur en fonction du contenu
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const minHeight = lineHeight * minRows;
    const maxHeight = lineHeight * maxRows;

    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    textarea.style.height = `${newHeight}px`;

    // Active le scroll si on atteint maxRows
    if (scrollHeight > maxHeight) {
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.overflowY = "hidden";
    }
  };

  // Auto-resize au montage
  useEffect(() => {
    autoResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form.Field name={name}>
      {(field: {
        state: {
          value: string;
          meta: { errors: string[] };
        };
        handleChange: (value: string) => void;
        handleBlur: () => void;
      }) => {
        const currentValue = field.state.value ?? "";
        const errors = field.state.meta.errors;
        const hasError = errors.length > 0;

        return (
          <div className={cn("flex flex-col gap-1.5", className)}>
            {label && (
              <Label
                htmlFor={id}
                className={cn(
                  "flex items-center gap-1",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {label}
                {required && <span className="text-destructive">*</span>}
              </Label>
            )}
            <Textarea
              id={id}
              ref={textareaRef}
              value={currentValue}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(hasError ? "border-destructive" : "border-input")}
              style={{
                minHeight: `${minRows * 1.5}rem`,
              }}
              onChange={(e) => {
                field.handleChange(e.target.value);
                // Auto-resize après la mise à jour
                setTimeout(autoResize, 0);
              }}
              onBlur={field.handleBlur}
              onInput={() => {
                autoResize();
              }}
            />
            {hasError && (
              <p className="text-sm text-destructive">{errors.join(", ")}</p>
            )}
            {!hasError && helperText && (
              <p className="text-sm text-muted-foreground">{helperText}</p>
            )}
          </div>
        );
      }}
    </form.Field>
  );
}

export default memo(TextArea);
