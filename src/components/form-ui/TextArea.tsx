import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { useField } from "formik";

interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name"> {
  label?: string;
  name: string;
  helperText?: string;
  required?: boolean;
  minRows?: number;
  maxRows?: number;
}

export default function TextArea({
  label,
  name,
  helperText,
  required = false,
  className = "",
  minRows = 3,
  maxRows = 10,
  ...props
}: TextAreaProps) {
  // Utilise useField de Formik pour gérer le champ
  const [field, meta] = useField(name);

  const errorMessage = meta.touched && meta.error ? meta.error : undefined;

  // Ref interne pour l'auto-resize
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

  // Auto-resize au montage et quand la valeur change
  useEffect(() => {
    autoResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={name}
          className="text-sm font-medium  flex items-center gap-1"
        >
          {label}
          {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <textarea
        id={name}
        className={`
            px-3 py-2 placeholder-muted-foreground placeholder:italic
            border rounded-md
            transition-colors
            resize-none
            bg-muted hover:bg-accent
            focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
            disabled:bg-muted disabled:cursor-not-allowed
            ${errorMessage ? "border-destructive" : "border-border"}
            ${className}
          `}
        {...field}
        ref={(e) => {
          textareaRef.current = e;
        }}
        onInput={(e) => {
          autoResize();
          // Appelle l'onChange de Formik
          field.onChange(e);
          // Appelle l'onInput du parent si fourni
          props.onInput?.(e);
        }}
        style={{
          minHeight: `${minRows * 1.5}rem`,
        }}
        {...props}
      />
      {errorMessage && (
        <span className="text-sm text-destructive">{errorMessage}</span>
      )}
      {!errorMessage && helperText && (
        <span className="text-sm text-muted-foreground">{helperText}</span>
      )}
    </div>
  );
}
