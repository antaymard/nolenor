"use node";

import { v } from "convex/values";
import type * as BlockNoteCore from "@blocknote/core";
import type * as ProsemirrorSyncModule from "@convex-dev/prosemirror-sync";
import type * as PmTransform from "@tiptap/pm/transform";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  importExternal,
  withHeadlessDom,
} from "./ia/helpers/headlessBlockNote";
import {
  blocksToProsemirrorDoc,
  createServerBlockNoteSchema,
} from "./lib/blockNoteServerSchema";

// Pousse `values.doc` dans le doc vivant d'un blocknote synchronisé (SPIKE,
// cf. blocknoteSync.ts). Appelé après toute écriture du `doc` qui ne vient
// pas d'un éditeur synchronisé : agent, restore de version, MCP.
//
// Remplace le contenu ENTIER du doc vivant : une frappe concurrente, non
// encore publiée dans `values.doc` quand l'agent a lu le document, est
// perdue. Acceptable pour le spike ; la cible est d'appliquer l'opération de
// l'agent elle-même sur le doc vivant.
//
// `@blocknote/core`, `@tiptap/pm` et le client prosemirror-sync sont chargés
// depuis node_modules par import caché (cf. convex.json `externalPackages`) :
// bundlés, ils embarqueraient leur propre copie de prosemirror, et des nodes
// créés par une copie ne passeraient pas les `instanceof` de l'autre.

export const pushDocToSync = internalAction({
  args: { nodeDataId: v.id("nodeDatas") },
  returns: v.null(),
  handler: async (ctx, { nodeDataId }) => {
    const blocks = await ctx.runQuery(internal.blocknoteSync.readStoredDoc, {
      nodeDataId,
    });
    if (blocks === null) return null;

    const [core, { Transform }, { ProsemirrorSync }] = await Promise.all([
      importExternal<typeof BlockNoteCore>("@blocknote/core"),
      importExternal<typeof PmTransform>("@tiptap/pm/transform"),
      importExternal<typeof ProsemirrorSyncModule>(
        "@convex-dev/prosemirror-sync",
      ),
    ]);
    const sync = new ProsemirrorSync<Id<"nodeDatas">>(
      components.prosemirrorSync,
    );

    await withHeadlessDom(async () => {
      const editor = core.BlockNoteEditor.create({
        schema: createServerBlockNoteSchema(core),
        _headless: true,
      });
      const next = blocksToProsemirrorDoc(core, editor, blocks);

      await sync.transform(ctx, nodeDataId, editor.pmSchema, (current) => {
        if (current.eq(next)) return null;
        const tr = new Transform(current);
        tr.replaceWith(0, current.content.size, next.content);
        return tr;
      });
    });
    return null;
  },
});
