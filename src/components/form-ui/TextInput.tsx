import type { InputHTMLAttributes } from "react";
import { useField } from "formik";
import { Input } from "../shadcn/input";
import { FieldError, FieldLabel } from "../shadcn/field";

interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "name"> {
  label?: string;
  name: string;
  helperText?: string;
  required?: boolean;
}

export default function TextInput({
  label,
  name,
  helperText,
  required = false,
  className = "",
  ...props
}: TextInputProps) {
  // Utilise useField de Formik pour gérer le champ
  const [field, meta] = useField(name);

  const errorMessage = meta.touched && meta.error ? meta.error : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <FieldLabel
          htmlFor={name}
          className="text-sm font-medium flex items-center gap-1"
        >
          {label}
          {required && <span className="text-destructive">*</span>}
        </FieldLabel>
      )}
      <Input
        id={name}
        type="text"
        className={`

          ${errorMessage ? "border-destructive" : "border-border"}
          ${className}
        `}
        {...field}
        {...props}
      />
      {errorMessage && (
        <FieldError className="text-sm text-destructive">
          {errorMessage}
        </FieldError>
      )}
      {!errorMessage && helperText && (
        <span className="text-sm text-muted-foreground">{helperText}</span>
      )}
    </div>
  );
}
