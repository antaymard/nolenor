import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { slideshowsValidator } from "./schemas/canvasesSchema";

export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    name: v.string(),
    id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { canvasId, name, id }) => {
    const authUserId = await requireAuth(ctx);
    const { canvas } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "editor",
    );

    const currentSlideshows = canvas.slideshows || [];
    const alreadyExists = currentSlideshows.some(
      (slideshow) => slideshow.id === id,
    );

    if (alreadyExists) {
      throw new ConvexError("A slideshow with this id already exists.");
    }

    const slideshow = {
      id,
      name,
      slides: [],
    };

    await ctx.db.patch(canvasId, {
      slideshows: [...currentSlideshows, slideshow],
    });

    return null;
  },
});

export const update = mutation({
  args: {
    canvasId: v.id("canvases"),
    slideshow: slideshowsValidator,
  },
  returns: slideshowsValidator,
  handler: async (ctx, { canvasId, slideshow }) => {
    const authUserId = await requireAuth(ctx);
    const { canvas } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "editor",
    );

    const currentSlideshows = canvas.slideshows || [];
    const slideshowExists = currentSlideshows.some(
      (existing) => existing.id === slideshow.id,
    );

    if (!slideshowExists) {
      throw new ConvexError("Slideshow not found.");
    }

    const updatedSlideshows = currentSlideshows.map((existing) =>
      existing.id === slideshow.id ? slideshow : existing,
    );

    await ctx.db.patch(canvasId, {
      slideshows: updatedSlideshows,
    });

    return slideshow;
  },
});

export const remove = mutation({
  args: {
    canvasId: v.id("canvases"),
    id: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { canvasId, id }) => {
    const authUserId = await requireAuth(ctx);
    const { canvas } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "editor",
    );

    const currentSlideshows = canvas.slideshows || [];
    const remainingSlideshows = currentSlideshows.filter(
      (slideshow) => slideshow.id !== id,
    );

    if (remainingSlideshows.length === currentSlideshows.length) {
      throw new ConvexError("Slideshow not found.");
    }

    await ctx.db.patch(canvasId, {
      slideshows: remainingSlideshows,
    });

    return id;
  },
});
