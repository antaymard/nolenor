// Textarea enrichi du composer : saisie libre + mentions `@` vers les nodes du
// canvas (dropdown de suggestions, pill sur la mention insérée).

import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useNoleStore } from "@/stores/noleStore";
import { useMemo } from "react";
import { MentionsInput, Mention } from "react-mentions";
import { useNodes } from "@xyflow/react";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { getNodeDataId } from "@/lib/nodeIdentity";

/** Pastille peinte derrière une mention. Uniquement du fond : le texte lui-même
 *  est rendu par le textarea posé au-dessus, et le `box-shadow` élargit la
 *  pastille sans pousser un seul caractère. */
const MENTION_PILL_STYLE = {
  backgroundColor: "oklch(0.932 0.032 255.585)", // blue-100
  borderRadius: "3px",
  boxShadow: "0 0 0 1px oklch(0.932 0.032 255.585)",
} as const;

/** Interligne du composer, en px. Fixé plutôt qu'hérité : toute la logique de
 *  hauteur (1 ligne au repos, N lignes max) se déduit de cette constante. */
const LINE_HEIGHT_PX = 20;
/** Hauteur au repos, en lignes. */
const DEFAULT_MIN_ROWS = 1;
/** Au-delà, l'input scrolle au lieu de continuer à grandir. */
const DEFAULT_MAX_ROWS = 10;

interface RichTextAreaProps {
  onSubmit?: () => void;
  /** Hauteur au repos, en lignes de texte. */
  minRows?: number;
  /** Hauteur maximale, en lignes de texte ; au-delà, l'input scrolle. */
  maxRows?: number;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * La hauteur est pilotée en CSS, pas à la main : en mode multi-lignes,
 * react-mentions laisse le *highlighter* dans le flux (il reprend le texte
 * saisi) et superpose le `<textarea>` en absolu sur toute la boîte. Contraindre
 * le highlighter entre `min-height` et `max-height` suffit donc à faire grandir
 * puis plafonner le composer, et le textarea suit tout seul via `height: 100%`.
 * Au-delà du plafond c'est lui qui scrolle — react-mentions resynchronise le
 * scroll du highlighter — et le champ revient à une ligne dès que la valeur est
 * vidée (envoi du message), sans réinitialisation explicite.
 */
export default function RichTextArea({
  onSubmit,
  minRows = DEFAULT_MIN_ROWS,
  maxRows = DEFAULT_MAX_ROWS,
  placeholder = "Ask Nolë, @ to mention a node",
  autoFocus = true,
}: RichTextAreaProps) {
  // Le brouillon est lu ici et pas plus haut : c'est le seul composant qui a
  // besoin du texte lui-même, donc le seul qui doive re-rendre à chaque
  // caractère. Le reste du composer se contente de `useHasUserInput`.
  const value = useNoleStore((state) => state.userInput);
  const onChange = useNoleStore((state) => state.setUserInput);
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const canvasNodes = useNodes();

  const nodesToMention = canvasNodes
    .filter((node) => node.data?.nodeDataId)
    .map((node) => {
      const nodeDataId = node.data.nodeDataId as Id<"nodeDatas">;
      const nodeData = nodeDatas.get(nodeDataId);
      return {
        id: node.id,
        display: nodeData ? getNodeDataTitle(nodeData) : node.id,
      };
    });

  const style = useMemo(
    () => buildStyle(minRows, maxRows),
    [minRows, maxRows],
  );

  // Le dropdown est sorti en portail : le composer vit dans des conteneurs qui
  // rognent (panneau du canvas, wrapper du pulse en `overflow: hidden`), et le
  // champ est ancré en bas — les suggestions doivent s'ouvrir vers le haut.
  const portalHost = typeof document !== "undefined" ? document.body : undefined;

  return (
    <MentionsInput
      autoFocus={autoFocus}
      style={style}
      value={value}
      placeholder={placeholder}
      suggestionsPortalHost={portalHost}
      forceSuggestionsAboveCursor
      a11ySuggestionsListLabel="Nodes du canvas à mentionner"
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            // Shift/Ctrl/Cmd+Enter → new line (default behavior)
            return;
          }
          // Enter alone → send
          e.preventDefault();
          onSubmit?.();
        }
      }}
      onChange={(_, newValue) => onChange(newValue)}
      customSuggestionsContainer={(children) => (
        <div className="min-w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {children}
        </div>
      )}
    >
      <Mention
        trigger="@"
        data={nodesToMention}
        markup="@{{__id__||__display__}}"
        displayTransform={(_id, display) => `@${display}`}
        appendSpaceOnAdd
        // Pas de padding ni de bordure : le highlighter doit rester calé au
        // pixel sur le textarea posé par-dessus. Le `box-shadow` élargit donc
        // la pastille sans déplacer le texte.
        style={MENTION_PILL_STYLE}
        renderSuggestion={(entry, _search, _highlightedDisplay, _index, focused) => {
          const node = canvasNodes.find((candidate) => candidate.id === entry.id);
          const nodeDataId = getNodeDataId(node);
          const nodeData = nodeDataId ? nodeDatas.get(nodeDataId) : undefined;
          const Icon = getNodeIcon(nodeData?.type);
          return (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700",
                focused && "bg-slate-100",
              )}
            >
              {Icon && <Icon className="shrink-0 text-slate-400" size={13} />}
              <span className="truncate">{entry.display}</span>
            </div>
          );
        }}
      />
    </MentionsInput>
  );
}

/**
 * Styles inline attendus par react-mentions (substyle). Highlighter et textarea
 * partagent exactement la même métrique — même interligne, ni marge ni bordure —
 * pour que le texte réellement affiché (le textarea) se superpose au pixel près
 * aux pastilles de mention peintes par le highlighter.
 */
function buildStyle(minRows: number, maxRows: number) {
  const minHeight = minRows * LINE_HEIGHT_PX;
  const maxHeight = maxRows * LINE_HEIGHT_PX;
  const shared = {
    margin: 0,
    padding: 0,
    border: 0,
    lineHeight: `${LINE_HEIGHT_PX}px`,
    minHeight,
    maxHeight,
  } as const;

  return {
    width: "100%",
    control: { minHeight, maxHeight },
    highlighter: {
      ...shared,
      // Le contenu déborde en silence : react-mentions recopie ici le
      // `scrollTop` du textarea pour garder les pastilles alignées.
      overflow: "hidden",
    },
    input: {
      ...shared,
      outline: "none",
      resize: "none",
      overflowX: "hidden",
      overflowY: "auto",
    },
    suggestions: {
      zIndex: 60,
      // Le fond blanc carré par défaut débordait des angles arrondis du menu.
      backgroundColor: "transparent",
      // react-mentions colle le menu à la ligne du curseur (et annule toute
      // marge dans son calcul) : un translate lui rend de l'air sans fausser
      // le positionnement.
      transform: "translateY(-6px)",
    },
  } as const;
}
