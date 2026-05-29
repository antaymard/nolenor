import { memo, useId, type InputHTMLAttributes } from "react";
import { Label } from "@/components/shadcn/label";
import { Input } from "@/components/shadcn/input";
import { cn } from "@/lib/utils";

// Type simplifié pour le form TanStack (les types réels sont très complexes)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TanStackFormApi = any;

interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "form"
> {
  form: TanStackFormApi;
  name: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  inputClassName?: string;
}

function TextInput({
  form,
  name,
  label,
  helperText,
  required = false,
  className,
  inputClassName,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const id = `input-${name}-${generatedId}`;

  return (
    <form.Field name={name}>
      {(field: {
        state: {
          value: string;
          meta: { errors: string[] };
        };
        handleChange: (value: string) => void;
        handleBlur: () => void;
        name: string;
      }) => {
        const errors = field.state.meta.errors;
        const hasError = errors.length > 0;

        return (
          <div className={cn("flex flex-col gap-1.5", className)}>
            {label && (
              <Label
                htmlFor={id}
                className="flex items-center gap-1 text-sm font-medium"
              >
                {label}
                {required && <span className="text-destructive">*</span>}
              </Label>
            )}
            <Input
              id={id}
              type="text"
              value={field.state.value ?? ""}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              className={cn(hasError && "border-destructive", inputClassName)}
              {...props}
            />
            {hasError && (
              <span className="text-sm text-destructive">{errors[0]}</span>
            )}
            {!hasError && helperText && (
              <span className="text-sm text-muted-foreground">
                {helperText}
              </span>
            )}
          </div>
        );
      }}
    </form.Field>
  );
}

export default memo(TextInput);
