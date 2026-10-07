import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import {
  collaboratorColor,
  collaboratorLabel,
  type Collaborator,
} from "@/stores/canvasPresenceStore";

/**
 * Pastille ronde d'un collaborateur : sa photo si elle existe, sinon son
 * initiale sur sa couleur (cf. `collaboratorColor`).
 *
 * Fait suivre les props restantes (ref comprise) : utilisable comme
 * `TooltipTrigger asChild`.
 */
export function CollaboratorAvatar({
  collaborator,
  className,
  style,
  ...props
}: ComponentProps<"span"> & { collaborator: Collaborator }) {
  const label = collaboratorLabel(collaborator);
  const initial = Array.from(label.trim())[0]?.toUpperCase() ?? "?";

  return (
    <span
      {...props}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        className,
      )}
      style={{
        backgroundColor: collaboratorColor(collaborator.userId),
        ...style,
      }}
      aria-label={label}
    >
      {collaborator.image ? (
        <img
          src={collaborator.image}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initial
      )}
    </span>
  );
}
