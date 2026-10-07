import type * as BlockNoteCore from "@blocknote/core";
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
