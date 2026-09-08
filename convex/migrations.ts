/**
 * Nettoyages ponctuels de données rendues invalides par un changement de
 * schéma. Une migration jouée jusqu'au bout peut être retirée de ce fichier.
 *
 * Historique (jouées partout, code supprimé) :
 * - `dropAttachedPages` : retirait `attachments.page` de `messageMetadata`.
 * - `dropCanvasViewportArrays` : retirait `slideshows` / `hotspots` de
 *   `canvases` (remplacés par le node `viewport`).
 *
 * M1 (A, not executed here): the component tracks enumeration, NOT graph
 * certification. Manual, revision-aware batches live in canvasGraphMigration.
 * No reader cutover or legacy cleanup belongs in this delivery.
 * See SPECS/node-canvas-db-split-rollout.md before running anything.
 */

import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { seedM1Canvas } from "./models/canvasGraphMigrationModels";

const migrations = new Migrations<DataModel>(components.migrations);

export const seedCanvasGraphM1 = migrations.define({
  table: "canvases",
  // A legacy canvas can approach 1 MiB. Do not read 32 entire graphs here.
  batchSize: 1,
  migrateOne: async (ctx, canvas) => {
    await seedM1Canvas(ctx, canvas);
  },
});

export const cancelM1Seed = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await migrations.cancel(ctx, internal.migrations.seedCanvasGraphM1);
    return null;
  },
});
