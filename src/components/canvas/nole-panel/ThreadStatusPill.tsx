import { cn } from "@/lib/utils";
import {
  getRunStatusAppearance,
  type ResolvedRunStatus,
  type ThreadRunFields,
} from "@/lib/threadRunStatus";
import { useResolvedRunStatus } from "@/hooks/useThreadRunStatus";

type ThreadStatusPillProps = {
  status: ResolvedRunStatus;
  /** `compact` pour la liste de threads, où la place manque. */
  size?: "default" | "compact";
  className?: string;
};

/**
 * Pastille d'état d'un thread, partagée par le header de conversation et la
 * liste de threads.
 *
 * Ne rend rien quand il n'y a rien à dire : une pastille « au repos » affichée
 * en permanence serait du bruit, et c'est justement son absence qui informe.
 */
export default function ThreadStatusPill({
  status,
  size = "default",
  className,
}: ThreadStatusPillProps) {
  const appearance = getRunStatusAppearance(status);
  if (!appearance) return null;

  const isRunning = status === "running";
  const compact = size === "compact";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        appearance.className,
        className,
      )}
      title={appearance.description}
    >
      {/* Un point qui pulse, et non l'orbe : à cette taille elle serait
          illisible, et elle reste la signature de l'overlay live au bas de la
          conversation — la répéter ici la banaliserait. */}
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          appearance.dotClassName,
          isRunning && "animate-pulse",
        )}
      />
      <span className={cn(compact && "sr-only")}>{appearance.label}</span>
    </span>
  );
}

/**
 * Variante branchée : prend les champs bruts d'un thread et résout le statut
 * elle-même.
 *
 * Exister comme composant, et pas comme un appel de hook dans la boucle de
 * rendu de la liste, est ce qui permet à chaque ligne d'avoir sa propre
 * minuterie de péremption sans que l'appelant ait à extraire un composant.
 */
export function ThreadRunStatusPill({
  thread,
  size,
  className,
}: {
  thread: ThreadRunFields | null | undefined;
  size?: ThreadStatusPillProps["size"];
  className?: string;
}) {
  const status = useResolvedRunStatus(thread);
  return <ThreadStatusPill status={status} size={size} className={className} />;
}
