import { v } from "convex/values";
import * as BlockNoteCore from "@blocknote/core";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { createServerBlockNoteSchema } from "./lib/blockNoteServerSchema";
import * as NodeDataModel from "./models/nodeDataModels";
import {
  stringifyBlockNoteDocumentForStorage,
  type BlockNoteBlock,
} from "./lib/blockNoteDocument";
import { prosemirrorSync } from "./blocknoteSync";

// Recopie du doc vivant d'un blocknote synchronisé dans `values.doc` (SPIKE,
// cf. blocknoteSync.ts), entièrement côté serveur, dans le runtime V8.
//
// `@blocknote/core` est importé normalement ici : la conversion doc
// ProseMirror -> blocs ne touche pas au DOM (cf. lib/
// blockNoteServerSchema.test.ts, en environnement Node pur). Module à part
// pour que seule cette fonction charge BlockNote : les fonctions de sync,
// appelées à chaque frappe, n'en paient pas l'import (blocknoteSync.ts ne
// référence `materializeLatest` que par `internal`).

// Une construction par isolate : le schéma ne dépend que des configs.
let editor: ReturnType<typeof createEditor> | null = null;
function createEditor() {
  return BlockNoteCore.BlockNoteEditor.create({
    schema: createServerBlockNoteSchema(BlockNoteCore),
    _headless: true,
  });
}

/**
 * Écrit dans `values.doc` le doc vivant à sa DERNIÈRE version, reconstruit
 * dans cette transaction (snapshot + steps suivants) : rien de plus récent ne
 * peut exister au moment de l'écriture.
 *
 * `userId` : l'auteur des derniers steps de la fenêtre (les args du dernier
 * appel gagnent), à qui le point de restauration est attribué.
 */
export const materializeLatest = internalMutation({
  args: { nodeDataId: v.id("nodeDatas"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, userId }) => {
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData || nodeData.type !== "blocknote") return null;

    const version = await ctx.runQuery(
      components.prosemirrorSync.lib.latestVersion,
      { id: nodeDataId },
    );
    if (version === null) return null;

    editor ??= createEditor();
    const { doc } = await prosemirrorSync.getDoc(
      ctx,
      nodeDataId,
      editor.pmSchema,
    );
    const blocks: unknown[] = [];
    doc.firstChild?.forEach((node) => {
      blocks.push(BlockNoteCore.nodeToBlock(node, editor!.pmSchema));
    });

    // Comparé sous sa forme stockée : `updateValues` ne détecte un no-op
    // que par `Object.is`, et des blocs ne valent jamais la chaîne stockée.
    // Sans ça, chaque fenêtre réindexerait le node pour rien.
    const stored = stringifyBlockNoteDocumentForStorage(
      blocks as BlockNoteBlock[],
    );
    if (stored === nodeData.values.doc) return null;

    await NodeDataModel.updateValues(ctx, {
      _id: nodeDataId,
      values: { doc: stored },
      actor: { type: "user", userId },
      fromSync: true,
    });
    return null;
  },
});
