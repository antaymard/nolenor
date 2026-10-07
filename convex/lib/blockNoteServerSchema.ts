import type * as BlockNoteCore from "@blocknote/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import {
  calloutBlockConfig,
  dateInlineContentConfig,
  mentionInlineContentConfig,
  pillInlineContentConfig,
} from "./blockNoteCustomSchema";

// Le schéma BlockNote de l'app, construit sans React pour le serveur.
//
// Reçoit le module `@blocknote/core` en paramètre plutôt que de l'importer :
// côté Convex, il n'est chargé que dans le runtime Node et par un import
// caché (cf. ia/helpers/headlessBlockNote.ts), alors que les tests l'importent
// normalement. Un import de type seul n'entraîne rien dans le bundle.
//
// Les `render` ne servent jamais : le serveur ne fait que convertir entre
// blocs et nodes ProseMirror. Ils existent parce que l'API les exige.

type Core = typeof BlockNoteCore;

export function createServerBlockNoteSchema(core: Core) {
  const callout = core.createBlockSpec(calloutBlockConfig, {
    render: () => {
      const dom = document.createElement("div");
      return { dom, contentDOM: dom };
    },
  });
  const inline = <T extends BlockNoteCore.CustomInlineContentConfig>(
    config: T,
  ) =>
    core.createInlineContentSpec(config, {
      render: () => ({ dom: document.createElement("span") }),
    });

  return core.BlockNoteSchema.create({
    blockSpecs: {
      ...core.defaultBlockSpecs,
      callout: callout(),
    },
    inlineContentSpecs: {
      ...core.defaultInlineContentSpecs,
      date: inline(dateInlineContentConfig),
      mention: inline(mentionInlineContentConfig),
      pill: inline(pillInlineContentConfig),
    },
  });
}

/** Ce que la conversion lit d'un éditeur : son schéma ProseMirror et ses styles. */
type ConversionEditor = {
  pmSchema: BlockNoteCore.BlockNoteEditor["pmSchema"];
  schema: { styleSchema: BlockNoteCore.StyleSchema };
};

/**
 * Le doc ProseMirror qui correspond à ces blocs, dans le schéma de `editor`.
 * BlockNote exige au moins un bloc : une liste vide donne un paragraphe vide,
 * comme un éditeur vidé.
 */
export function blocksToProsemirrorDoc(
  core: Core,
  editor: ConversionEditor,
  blocks: unknown[],
) {
  const schema = editor.pmSchema;
  const nonEmpty = blocks.length > 0 ? blocks : [{ type: "paragraph" }];
  const nodes = nonEmpty.map((block) =>
    core.blockToNode(
      block as BlockNoteCore.PartialBlock<
        BlockNoteCore.BlockSchema,
        BlockNoteCore.InlineContentSchema,
        BlockNoteCore.StyleSchema
      >,
      schema,
      editor.schema.styleSchema,
    ),
  );
  return schema.nodes.doc.create(
    null,
    schema.nodes.blockGroup.create(null, nodes),
  );
}

/**
 * Les steps qui font passer le doc `current` à `next`, en ne remplaçant que
 * les blocs de premier niveau qui diffèrent (préfixe et suffixe communs
 * conservés). Un remplacement du doc entier ferait sauter le curseur des
 * autres éditeurs ouverts, qui se mappe à travers ces steps. null si les deux
 * docs sont identiques.
 */
export function replaceChangedBlocks(
  current: PmNode,
  next: PmNode,
): Transform | null {
  const before = current.firstChild;
  const after = next.firstChild;
  if (!before || !after) throw new Error("BlockNote doc without blockGroup.");

  let start = 0;
  while (
    start < before.childCount &&
    start < after.childCount &&
    before.child(start).eq(after.child(start))
  ) {
    start++;
  }
  if (start === before.childCount && start === after.childCount) return null;

  let endBefore = before.childCount;
  let endAfter = after.childCount;
  while (
    endBefore > start &&
    endAfter > start &&
    before.child(endBefore - 1).eq(after.child(endAfter - 1))
  ) {
    endBefore--;
    endAfter--;
  }

  // +1 : on entre dans le blockGroup, premier enfant du doc.
  let from = 1;
  for (let i = 0; i < start; i++) from += before.child(i).nodeSize;
  let to = from;
  for (let i = start; i < endBefore; i++) to += before.child(i).nodeSize;
  const inserted: PmNode[] = [];
  for (let i = start; i < endAfter; i++) inserted.push(after.child(i));

  const tr = new Transform(current);
  tr.replaceWith(from, to, inserted);
  return tr;
}
