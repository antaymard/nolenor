import { TbCloudExclamation, TbMicrophone } from "react-icons/tb";
import { ThinkingOrb } from "thinking-orbs";
import { Kbd } from "@/components/shadcn/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import SoundWaveAnimation from "../SoundWaveAnimation";

/**
 * Les statuts de la barre d'un composer Nolë, partagés par le panel et
 * l'omnibar : la dictée, et les fenêtres non enregistrées qui bloquent l'envoi.
 */

export function MicStatus({
  isRecording,
  isTranscribing,
  level,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  level: number;
}) {
  if (isRecording) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-500">
        <SoundWaveAnimation level={level} />
        <span>Listening...</span>
      </span>
    );
  }
  if (isTranscribing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <ThinkingOrb state="listening" size={20} />
        <span>Transcription…</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <TbMicrophone size={14} className="shrink-0" />
      <Kbd>Alt + Ctrl</Kbd>
    </span>
  );
}

export function DirtyWindowsBadge({ count }: { count: number }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-500">
          <TbCloudExclamation size={14} className="stroke-2" />
          {count}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-sm">
        Please save or close the modified windows before sending your message.
      </TooltipContent>
    </Tooltip>
  );
}
