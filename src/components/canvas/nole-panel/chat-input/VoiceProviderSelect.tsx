import { TbCheck, TbWaveSine } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LiveTranscriptionProvider } from "@/hooks/useLiveTranscription";
import { useVoiceStore } from "@/stores/voiceStore";

const PROVIDERS: ReadonlyArray<{
  value: LiveTranscriptionProvider;
  label: string;
  hint: string;
}> = [
  {
    value: "gladia",
    label: "Gladia",
    hint: "Vocabulaire métier, fr/en",
  },
  {
    value: "mistral",
    label: "Mistral",
    hint: "Voxtral, langue auto",
  },
];

type VoiceProviderSelectProps = {
  /** Désactivé pendant une dictée : changer de moteur en plein vol n'a pas de sens. */
  disabled?: boolean;
  triggerClassName?: string;
  iconSize?: number;
};

/**
 * Sélecteur du moteur de dictée, partagé par les composers desktop et mobile —
 * seul le dimensionnement du trigger diffère.
 *
 * Le choix est conservé par appareil (`useVoiceStore`, persisté en
 * localStorage). Il ne s'applique qu'à la dictée LIVE : le fallback batch passe
 * toujours par Mistral côté Convex.
 */
export default function VoiceProviderSelect({
  disabled,
  triggerClassName,
  iconSize = 12,
}: VoiceProviderSelectProps) {
  const provider = useVoiceStore((state) => state.provider);
  const setProvider = useVoiceStore((state) => state.setProvider);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          title="Moteur de dictée"
          className={cn("text-slate-500", triggerClassName)}
        >
          <TbWaveSine size={iconSize} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs font-normal text-slate-400">
          Moteur de dictée
        </DropdownMenuLabel>
        {PROVIDERS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => setProvider(option.value)}
            className={cn(
              provider === option.value && "font-medium",
              "flex items-center justify-between gap-3",
            )}
          >
            <span className="flex items-center gap-1.5">
              <p>{option.label}</p>
              <span className="text-xs text-slate-400">{option.hint}</span>
            </span>
            {provider === option.value && <TbCheck />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
