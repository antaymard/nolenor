/// <reference types="vite/client" />
// Recipes : CRUD, plafonds, lancement au clic (au nom de celui qui clique) et
// cron des routines. Le run lui-même est celui de la harness : on vérifie
// qu'il est ouvert et rattaché à la recipe, pas ce que fait Nolë (l'action de
// génération planifiée ne s'exécute jamais, les timers sont figés).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import errors from "./config/errorsConfig";
import { MAX_SCHEDULED_RECIPES } from "./models/recipeModels";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.parse("2026-10-09T10:17:00Z");
const DAILY_9H = {
  kind: "schedule",
  every: "day",
  at: "09:00",
  timezone: "Europe/Paris",
} as const;

function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t, "agent");
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {});
    const viewer = await ctx.db.insert("users", {});
    const coEditor = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: owner,
      name: "Canvas",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("shares", {
      resourceType: "canvas",
      canvasId,
      userId: viewer,
      permission: "viewer",
      grantedBy: owner,
    });
    const coEditorShare = await ctx.db.insert("shares", {
      resourceType: "canvas",
      canvasId,
      userId: coEditor,
      permission: "editor",
      grantedBy: owner,
    });
    return { owner, viewer, coEditor, canvasId, coEditorShare };
  });
}

const as = (t: T, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|session` });

function fields(canvasId: Id<"canvases">, overrides: object = {}) {
  return {
    name: "Annonces",
    instructions: "Mets à jour le tableau des annonces.",
    canvasId,
    triggers: [{ kind: "manual" as const }],
    enabled: true,
    ...overrides,
  };
}

async function read(t: T, userId: Id<"users">, recipeId: Id<"recipes">) {
  const recipe = await as(t, userId).query(api.recipes.get, { recipeId });
  if (!recipe) throw new Error("recipe not found");
  return recipe;
}

const runsOf = (t: T, recipeId: Id<"recipes">) =>
  t.run((ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
      .collect(),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("create / update", () => {
  test("stores the recipe and its next scheduled run", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { name: "  Annonces  ", triggers: [DAILY_9H] }),
    );
    const recipe = await read(t, owner, recipeId);
    expect(recipe.name).toBe("Annonces");
    // 9 h à Paris (UTC+2), déjà passé à 12 h 17 : demain 7 h UTC.
    expect(recipe.nextRunAt).toBe(Date.parse("2026-10-10T07:00:00Z"));
  });

  test("a manual-only or disabled recipe has no next run", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const manual = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId),
    );
    const disabled = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H], enabled: false }),
    );
    for (const recipeId of [manual, disabled]) {
      const recipe = await read(t, owner, recipeId);
      expect(recipe.nextRunAt).toBeUndefined();
    }
  });

  test("rejects empty fields and invalid schedules", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { name: " " }),
      ),
    ).rejects.toThrow(errors.RECIPE_NAME_REQUIRED);
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { triggers: [{ ...DAILY_9H, at: "9h" }] }),
      ),
    ).rejects.toThrow(/HH:MM/);
  });

  test("the owner must be editor of the target canvas", async () => {
    const t = setup();
    const { viewer, canvasId } = await seed(t);
    await expect(
      as(t, viewer).mutation(api.recipes.create, fields(canvasId)),
    ).rejects.toThrow(errors.INSUFFICIENT_PERMISSIONS);
  });

  test("only the owner can read or edit a recipe", async () => {
    const t = setup();
    const { owner, coEditor, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId),
    );
    expect(
      await as(t, coEditor).query(api.recipes.get, { recipeId }),
    ).toBeNull();
    await expect(
      as(t, coEditor).mutation(api.recipes.update, {
        recipeId,
        ...fields(canvasId),
      }),
    ).rejects.toThrow(errors.RECIPE_NOT_FOUND);
  });

  test("caps active scheduled recipes per user", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    for (let i = 0; i < MAX_SCHEDULED_RECIPES; i++) {
      await as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { triggers: [DAILY_9H] }),
      );
    }
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { triggers: [DAILY_9H] }),
      ),
    ).rejects.toThrow(errors.RECIPE_TOO_MANY_SCHEDULED);
    // Manuelle ou désactivée : hors plafond.
    await as(t, owner).mutation(api.recipes.create, fields(canvasId));
    const off = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H], enabled: false }),
    );
    await expect(
      as(t, owner).mutation(api.recipes.setEnabled, {
        recipeId: off,
        enabled: true,
      }),
    ).rejects.toThrow(errors.RECIPE_TOO_MANY_SCHEDULED);
  });

  test("disabling clears the next run, enabling recomputes it", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    await as(t, owner).mutation(api.recipes.setEnabled, {
      recipeId,
      enabled: false,
    });
    expect((await read(t, owner, recipeId)).nextRunAt).toBeUndefined();
    await as(t, owner).mutation(api.recipes.setEnabled, {
      recipeId,
      enabled: true,
    });
    expect((await read(t, owner, recipeId)).nextRunAt).toBe(
      Date.parse("2026-10-10T07:00:00Z"),
    );
  });
});

describe("once", () => {
  const IN_TWO_HOURS = NOW + 2 * 60 * 60 * 1000;

  test("a one-time run must be in the future, and within a year", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { triggers: [{ kind: "once", at: NOW - 1 }] }),
      ),
    ).rejects.toThrow(errors.RECIPE_ONCE_IN_PAST);
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, {
          triggers: [{ kind: "once", at: NOW + 400 * 24 * 60 * 60 * 1000 }],
        }),
      ),
    ).rejects.toThrow(errors.RECIPE_ONCE_TOO_FAR);
  });

  test("fires once, then leaves the cron; the recipe stays editable", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [{ kind: "once", at: IN_TWO_HOURS }] }),
    );
    expect((await read(t, owner, recipeId)).nextRunAt).toBe(IN_TWO_HOURS);

    vi.setSystemTime(IN_TWO_HOURS + 60_000);
    await t.mutation(internal.recipes.runDue, {});
    const fired = await read(t, owner, recipeId);
    expect(fired.nextRunAt).toBeUndefined();
    // Toujours active : un déclencheur manuel ajouté plus tard marchera.
    expect(fired.enabled).toBe(true);

    // Le formulaire renvoie le `once` passé tel quel : accepté.
    await as(t, owner).mutation(api.recipes.update, {
      recipeId,
      ...fields(canvasId, {
        name: "Renamed",
        triggers: [{ kind: "once", at: IN_TWO_HOURS }],
      }),
    });
    expect((await read(t, owner, recipeId)).name).toBe("Renamed");
  });

  test("a past one-time run no longer counts against the cap", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const once = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [{ kind: "once", at: IN_TWO_HOURS }] }),
    );
    for (let i = 0; i < MAX_SCHEDULED_RECIPES - 1; i++) {
      await as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { triggers: [DAILY_9H] }),
      );
    }
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { triggers: [DAILY_9H] }),
      ),
    ).rejects.toThrow(errors.RECIPE_TOO_MANY_SCHEDULED);

    vi.setSystemTime(IN_TWO_HOURS + 60_000);
    await t.mutation(internal.recipes.runDue, {});
    expect((await read(t, owner, once)).nextRunAt).toBeUndefined();
    await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
  });
});

describe("launch", () => {
  test("opens a Nolë run on a new thread, attached to the recipe", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId),
    );
    const { threadId } = await as(t, owner).mutation(api.recipes.launch, {
      recipeId,
    });

    const runs = await runsOf(t, recipeId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      threadId,
      userId: owner,
      canvasId,
      agentName: "Nolë",
      profile: "nole",
      request: "Mets à jour le tableau des annonces.",
      status: "running",
    });
    const metadata = await t.run((ctx) =>
      ctx.db
        .query("threadMetadata")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .unique(),
    );
    expect(metadata?.run?.profile).toBe("nole");
    const recipe = await read(t, owner, recipeId);
    expect(recipe.lastRunAt).toBe(NOW);
    expect(
      await as(t, owner).query(api.recipes.listRuns, { recipeId }),
    ).toHaveLength(1);
  });

  test("refuses a second launch while the first run is going", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId),
    );
    await as(t, owner).mutation(api.recipes.launch, { recipeId });
    await expect(
      as(t, owner).mutation(api.recipes.launch, { recipeId }),
    ).rejects.toThrow(errors.RECIPE_ALREADY_RUNNING);
  });

  test("a run waiting for an answer does not block the next one", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId),
    );
    await as(t, owner).mutation(api.recipes.launch, { recipeId });
    // Nolë a posé une question : le run attend, il ne travaille plus.
    const [first] = await runsOf(t, recipeId);
    await t.run((ctx) =>
      ctx.db.patch("runs", first._id, { status: "waiting" }),
    );

    await as(t, owner).mutation(api.recipes.launch, { recipeId });
    expect(await runsOf(t, recipeId)).toHaveLength(2);
  });

  test("rejects instructions that are too long", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    await expect(
      as(t, owner).mutation(
        api.recipes.create,
        fields(canvasId, { instructions: "x".repeat(10_001) }),
      ),
    ).rejects.toThrow(errors.RECIPE_INSTRUCTIONS_TOO_LONG);
  });

  test("another member runs it under their own name, only with a manual trigger", async () => {
    const t = setup();
    const { owner, coEditor, viewer, canvasId } = await seed(t);
    const scheduledOnly = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    await expect(
      as(t, coEditor).mutation(api.recipes.launch, { recipeId: scheduledOnly }),
    ).rejects.toThrow(errors.RECIPE_NOT_LAUNCHABLE);

    const manual = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId),
    );
    // Lecteur seulement : Nolë écrit dans le canvas, il faut être éditeur.
    await expect(
      as(t, viewer).mutation(api.recipes.launch, { recipeId: manual }),
    ).rejects.toThrow(errors.INSUFFICIENT_PERMISSIONS);

    await as(t, coEditor).mutation(api.recipes.launch, { recipeId: manual });
    const [run] = await runsOf(t, manual);
    expect(run.userId).toBe(coEditor);
  });
});

describe("routines", () => {
  test("runDue schedules due recipes and moves them to their next slot", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    // Le lendemain, 7 h 00 UTC passées d'une minute.
    vi.setSystemTime(Date.parse("2026-10-10T07:01:00Z"));
    await t.mutation(internal.recipes.runDue, {});

    const recipe = await read(t, owner, recipeId);
    expect(recipe.nextRunAt).toBe(Date.parse("2026-10-11T07:00:00Z"));
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled
        .filter((job) => job.name.includes("runScheduled"))
        .map((job) => job.args[0]),
    ).toEqual([{ recipeId }]);
  });

  test("runDue sets aside a recipe whose schedule breaks, and runs the others", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const good = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    // Écrite sans passer par la validation : un fuseau que le runtime ne
    // connaît (plus).
    const broken = await t.run((ctx) =>
      ctx.db.insert("recipes", {
        ...fields(canvasId),
        userId: owner,
        triggers: [{ ...DAILY_9H, timezone: "Mars/Olympus" }],
        nextRunAt: NOW - 1,
        updatedAt: NOW,
      }),
    );
    vi.setSystemTime(Date.parse("2026-10-10T07:01:00Z"));
    await t.mutation(internal.recipes.runDue, {});

    const brokenAfter = await read(t, owner, broken);
    expect(brokenAfter.enabled).toBe(false);
    expect(brokenAfter.nextRunAt).toBeUndefined();
    expect((await read(t, owner, good)).nextRunAt).toBe(
      Date.parse("2026-10-11T07:00:00Z"),
    );
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled
        .filter((job) => job.name.includes("runScheduled"))
        .map((job) => job.args[0]),
    ).toEqual([{ recipeId: good }]);
  });

  test("runDue ignores recipes that are not due", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    await as(t, owner).mutation(api.recipes.create, fields(canvasId));
    const scheduledRecipe = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    await t.mutation(internal.recipes.runDue, {});
    const recipe = await read(t, owner, scheduledRecipe);
    expect(recipe.nextRunAt).toBe(Date.parse("2026-10-10T07:00:00Z"));
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled.filter((job) => job.name.includes("runScheduled")),
    ).toHaveLength(0);
  });

  test("runScheduled launches as the owner, and skips while a run is going", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    await t.mutation(internal.recipes.runScheduled, { recipeId });
    await t.mutation(internal.recipes.runScheduled, { recipeId });
    const runs = await runsOf(t, recipeId);
    expect(runs).toHaveLength(1);
    expect(runs[0].userId).toBe(owner);
  });

  test("a routine whose owner lost editor access disables itself", async () => {
    const t = setup();
    const { coEditor, canvasId, coEditorShare } = await seed(t);
    const recipeId = await as(t, coEditor).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H] }),
    );
    await t.run((ctx) =>
      ctx.db.patch("shares", coEditorShare, { permission: "viewer" }),
    );

    await t.mutation(internal.recipes.runScheduled, { recipeId });
    expect(await runsOf(t, recipeId)).toHaveLength(0);
    const recipe = await read(t, coEditor, recipeId);
    expect(recipe.enabled).toBe(false);
    expect(recipe.nextRunAt).toBeUndefined();
  });

  test("a disabled recipe is not launched by the cron", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);
    const recipeId = await as(t, owner).mutation(
      api.recipes.create,
      fields(canvasId, { triggers: [DAILY_9H], enabled: false }),
    );
    await t.mutation(internal.recipes.runScheduled, { recipeId });
    expect(await runsOf(t, recipeId)).toHaveLength(0);
  });
});
