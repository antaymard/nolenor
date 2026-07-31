import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";
import { parseRichTextDoc } from "@/components/fields/shared/richTextDoc";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Node canvas : rendu statique, jamais d'éditeur BlockNote monté dans un node
// (contrainte de perf, désormais imposée par le catalogue de variants —
// rich_text.full n'est autorisé que sur la surface window).
//
// `lines` borne la hauteur de l'extrait. Le clamp est appliqué au conteneur
// (et non via -webkit-line-clamp sur le texte) parce que le contenu est un
// arbre de blocs, pas un paragraphe : couper à N lignes de texte n'aurait pas
// de sens sur une liste ou un tableau.
export default function RichTextExcerptView({
  field,
  value,
  options,
}: FieldViewProps) {
  const doc = parseRichTextDoc(value);

  if (!doc) {
    return (
      <span className="block text-sm text-muted-foreground/60 italic px-0.5">
        {field.name}
      </span>
    );
  }

  // options est complet ici (parseVariantOptions applique les défauts du
  // schéma du variant) ; le fallback ne couvre que le cas d'un variant dont
  // le schéma aurait perdu la clé.
  const lines = typeof options?.lines === "number" ? options.lines : 3;

  return (
    <div
      className="min-h-0 overflow-hidden text-sm"
      // ~1.5em par ligne, cohérent avec le line-height du rendu statique.
      style={{ maxHeight: `${lines * 1.5}em` }}
    >
      <BlockNoteStatic blocks={doc} className="select-none" />
    </div>
  );
}
