import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Textarea } from "@/components/shadcn/textarea";
import { Kbd } from "@/components/shadcn/kbd";
import { cn } from "@/lib/utils";
import { ROW_HEIGHT_CONFIG, type RowHeight } from "./types";

export interface TextCellEditorProps {
  value: string;
  isEditing: boolean;
  rowHeight: RowHeight;
  onClick: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Cellule texte multiligne.
 *
 * L'ancien éditeur était un `<input>` : aucun retour à la ligne possible, et la
 * valeur restait coupée à la largeur de la colonne pendant la frappe. Ici la
 * saisie se fait dans un `<textarea>` porté par un Popover ancré sur la
 * cellule — ce qui contourne d'un coup les trois couches de clipping de la
 * grille (`truncate`, le `whitespace-nowrap` du TableCell shadcn, et
 * l'`overflow: hidden` de la cellule draggable) sans y toucher.
 *
 * Le Popover est aussi le motif déjà utilisé par les cellules date, link, node
 * et select : rien de nouveau à apprendre pour la suite du dossier.
 */
export function TextCellEditor({
  value,
  isEditing,
  rowHeight,
  onClick,
  onChange,
  onBlur,
}: TextCellEditorProps) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Échap doit annuler, un clic à l'extérieur doit valider. Les deux passent par
  // le même `onOpenChange`, d'où ce drapeau pour les distinguer.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      setDraft(value);
      cancelledRef.current = false;
    }
  }, [isEditing, value]);

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    if (isEditing) autoGrow();
  }, [isEditing, draft]);

  const commit = () => {
    if (draft !== value) onChange(draft);
  };

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (open) return;
        if (!cancelledRef.current) commit();
        onBlur();
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={cn(
            "block w-full min-h-[1.4em] rounded px-1 cursor-text hover:bg-muted/50",
            ROW_HEIGHT_CONFIG[rowHeight].clamp,
          )}
          onClick={onClick}
        >
          {value}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 shadow-lg"
        style={{
          // Au moins aussi large que la colonne, jamais si étroit qu'on ne
          // puisse rien lire.
          minWidth: "max(var(--radix-popover-trigger-width), 320px)",
          maxWidth: "min(640px, 90vw)",
        }}
        // Radix écoute Échap en capture sur le document, donc AVANT le handler
        // du textarea : sans ce crochet, la fermeture arrivait avec le drapeau
        // encore à false et Échap validait au lieu d'annuler.
        onEscapeKeyDown={() => {
          cancelledRef.current = true;
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }}
      >
        <Textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          // `field-sizing: content` ferait doublon avec le calcul de hauteur
          // ci-dessus, et n'est pas supporté partout.
          className="[field-sizing:fixed] max-h-[40vh] min-h-9 resize-none border-0 py-2 text-sm shadow-none focus-visible:ring-0"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              cancelledRef.current = true;
              onBlur();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              commit();
              onBlur();
            }
            // Shift+Entrée et Alt+Entrée tombent dans le comportement natif du
            // textarea : un vrai retour à la ligne.
          }}
        />
        <div className="flex items-center gap-1.5 border-t px-2 py-1 text-[11px] text-muted-foreground">
          <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd>
          <span>new line</span>
          <span className="mx-1 opacity-40">·</span>
          <Kbd>↵</Kbd>
          <span>save</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
