import { action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

// Action pour récupérer les métadonnées d'un lien via LinkPreview API
export const fetchLinkMetadata = action({
  args: {
    url: v.string(),
  },
  returns: v.object({
    title: v.string(),
    description: v.string(),
    image: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, { url }) => {
    await requireAuth(ctx);

    const apiKey = process.env.LINK_PREVIEW_APIKEY;

    if (!apiKey) {
      throw new Error("LINK_PREVIEW_APIKEY n'est pas configurée");
    }

    try {
      const response = await fetch(
        `https://api.linkpreview.net/?q=${encodeURIComponent(url)}&fields=title,description,image,url,site_name`,
        {
          headers: {
            "X-Linkpreview-Api-Key": apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`LinkPreview API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        title: data.title || url,
        description: data.description || "",
        image: data.image || "",
        url: data.url || url,
        // site_name: data.site_name || "", // Basic plan needed
      };
    } catch (error) {
      console.error("Error fetching link metadata:", error);
      throw new Error("Failed to fetch link metadata");
    }
  },
});
