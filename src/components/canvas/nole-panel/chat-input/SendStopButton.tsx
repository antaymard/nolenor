import {
  TbArrowUp,
  TbExclamationCircle,
  TbPlayerStopFilled,
} from "react-icons/tb";
import { RiLoaderLine } from "react-icons/ri";
import { Button } from "@/components/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";

type SendStopButtonProps = {
  /** Le message peut réellement partir (texte saisi, pas d'envoi en cours). */
  canSend: boolean;
  onSend: () => void;
  isSending: boolean;
  /** L'assistant répond : le bouton devient un stop. */
  isAssistantResponding: boolean;
  isCancelling: boolean;
  onStop: () => void | Promise<void>;
  /** Des fenêtres non enregistrées bloquent l'envoi. */
  hasDirtyWindows: boolean;
  className?: string;
};

/**
 * Contrôle unique du composer, réduit à une icône ronde : envoyer, ou arrêter
 * l'assistant qui répond. Les deux états se relaient au même endroit pour que
 * le pouce (ou le curseur) n'ait jamais à se déplacer.
 *
 * Pendant une réponse, un texte saisi l'emporte : le message part en file et
 * rejoint le run au step suivant. Sans texte, le bouton arrête le run.
 */
export default function SendStopButton({
  canSend,
  onSend,
  isSending,
  isAssistantResponding,
  isCancelling,
  onStop,
  hasDirtyWindows,
  className,
}: SendStopButtonProps) {
  if (isAssistantResponding && !canSend) {
    return (
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            disabled={isCancelling || isSending}
            onClick={() => void onStop()}
            aria-label="Stop"
            className={cn(
              "size-8 rounded-full border border-slate-300 bg-surface text-slate-600",
              "hover:bg-slate-100 hover:text-slate-900",
              className,
            )}
          >
            {isCancelling ? (
              <RiLoaderLine size={14} className="animate-spin" />
            ) : (
              <TbPlayerStopFilled size={12} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Stop</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      disabled={!canSend}
      onClick={onSend}
      aria-label={
        isAssistantResponding
          ? "Envoyer — ajouté après l'étape en cours"
          : "Envoyer le message"
      }
      title={
        isAssistantResponding
          ? "Ajouté à la réponse en cours, après l'étape actuelle"
          : undefined
      }
      className={cn(
        "size-8 rounded-full transition-all",
        // Rien à envoyer : le bouton s'efface au lieu de sauter hors du flux,
        // pour que la barre d'actions garde sa hauteur.
        !canSend && "opacity-40",
        className,
      )}
    >
      {isSending ? (
        <RiLoaderLine size={14} className="animate-spin" />
      ) : hasDirtyWindows ? (
        <TbExclamationCircle size={15} />
      ) : (
        <TbArrowUp size={15} className="stroke-[2.5]" />
      )}
    </Button>
  );
}
