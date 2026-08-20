import { TbArrowUp, TbExclamationCircle, TbPlayerStopFilled } from "react-icons/tb";
import { RiLoaderLine } from "react-icons/ri";
import { Button } from "@/components/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";

type SendStopButtonProps = {
  /** Le message peut réellement partir (texte saisi, rien en cours). */
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
 * Contrôle unique du composer, réduit à une icône ronde : envoyer tant que
 * l'assistant se tait, arrêter dès qu'il répond. Les deux états se relaient au
 * même endroit pour que le pouce (ou le curseur) n'ait jamais à se déplacer.
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
  if (isAssistantResponding) {
    return (
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            disabled={isCancelling || isSending}
            onClick={() => void onStop()}
            aria-label="Arrêter la réponse"
            className={cn(
              "size-8 rounded-full border border-slate-300 bg-white text-slate-600",
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
        <TooltipContent side="top">Arrêter la réponse</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      disabled={!canSend}
      onClick={onSend}
      aria-label="Envoyer le message"
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
