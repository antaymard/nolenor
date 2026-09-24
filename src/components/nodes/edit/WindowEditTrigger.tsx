import type { ComponentProps, Ref } from "react";
import { TbPencil } from "react-icons/tb";

/** Le trigger varie (toolbar canvas vs header de window), le contenu non. */
export type NodeEditTriggerVariant = "toolbar" | "window";

interface WindowEditTriggerProps extends ComponentProps<"button"> {
  title: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Crayon au format des boutons du header de window (`WindowFrame`, flottante
 * ou plein écran) : même taille, même survol que refresh/minimize.
 *
 * `data-window-control` + `stopPropagation` au mousedown : sans ça, le header
 * flottant prendrait le clic pour le début d'un drag (cf. `WindowFrame`) et
 * `WindowsContainer` y verrait un bring-to-front.
 *
 * Le `ref` et le spread `...props` sont obligatoires : sous `asChild`, Radix
 * (`PopoverTrigger` / `DialogTrigger`) injecte `onClick`, `aria-expanded` et
 * la ref d'ancrage via le `Slot`. Sans eux, le clic est avalé et le
 * popover/dialog ne s'ouvre jamais — c'était le bug.
 */
export function WindowEditTrigger({
  title,
  ref,
  className,
  onMouseDown,
  ...props
}: WindowEditTriggerProps) {
  return (
    <button
      type="button"
      {...props}
      data-window-control="true"
      className={
        className ??
        "shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
      }
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(e);
      }}
      title={title}
      aria-label={props["aria-label"] ?? title}
      ref={ref}
    >
      <TbPencil size={15} />
    </button>
  );
}
