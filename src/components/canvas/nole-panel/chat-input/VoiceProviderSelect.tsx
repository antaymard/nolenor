import type { ReactNode } from "react";
import { TbCheck } from "react-icons/tb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LiveTranscriptionProvider } from "@/hooks/useLiveTranscription";
import { useNoleStore } from "@/stores/noleStore";

const PROVIDERS: ReadonlyArray<{
  value: LiveTranscriptionProvider;
  label: string;
  hint: string;
}> = [
  {
    value: "gladia",
    label: "Gladia",
    hint: "Custom vocabulary · fr/en",
  },
  {
    value: "mistral",
    label: "Mistral",
    hint: "Voxtral · auto language",
  },
];

type VoiceProviderSelectProps = {
  /**
   * Élément qui ouvre le menu. Passé par l'appelant plutôt que fixé ici : sur
   * desktop c'est l'indicateur micro lui-même (inerte par ailleurs), sur mobile
   * un bouton dédié — le micro y sert au push-to-talk et ne peut pas cumuler.
   */
  children: ReactNode;
  /** Désactivé pendant une dictée : changer de moteur en plein vol n'a pas de sens. */
  disabled?: boolean;
};

/**
 * Menu de choix du moteur de dictée, partagé par les composers desktop et
 * mobile — seul le trigger diffère.
 *
 * Le choix vit dans le store Nolë, comme celui du modèle : il survit au
 * repliement du panel, mais pas à un rechargement. Il ne s'applique qu'à la
 * dictée LIVE — le fallback batch passe toujours par Mistral côté Convex.
 */
export default function VoiceProviderSelect({
  children,
  disabled,
}: VoiceProviderSelectProps) {
  const provider = useNoleStore((state) => state.voiceProvider);
  const setProvider = useNoleStore((state) => state.setVoiceProvider);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs font-normal text-slate-400">
          Dictation engine
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
