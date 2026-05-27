import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import {
  LinkupAuthenticationError,
  LinkupClient,
  LinkupFetchError,
  LinkupFetchResponseTooLargeError,
  LinkupFetchUnsupportedContentTypeError,
  LinkupInvalidRequestError,
} from "linkup-sdk";
import { ToolConfig, toolError } from "./toolHelpers";
import { toolAgentNames } from "../agentConfig";

export const openWebPageToolConfig: ToolConfig = {
  name: "open_webpage",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

const client = new LinkupClient({
  apiKey: process.env.LINKUP_API_KEY!,
});

export const openWebPageTool = createTool({
  description:
    "Fetch one or more public URLs and return clean markdown via Linkup. Handles JavaScript-heavy pages and PDFs natively. Up to 10 URLs per call, fetched in parallel.",
  inputSchema: z.object({
    explanation: z
      .string()
      .describe("3-5 words explaining the research intent."),
    urls: z
      .array(z.string())
      .max(10)
      .describe(
        "List of URLs to fetch. Maximum 10 per request, processed in parallel.",
      ),
    include_raw_html: z
      .boolean()
      .default(false)
      .describe(
        "Also include the raw HTML of the page in the response. Defaults to false. Enable only when you need HTML structure beyond what markdown captures (e.g. extracting table layouts or inline attributes).",
      ),
    extract_images: z
      .boolean()
      .default(false)
      .describe(
        "Also return a list of images found on the page (URLs + alt text). Enable only when image references are actually needed.",
      ),
  }),
  execute: async (
    ctx,
    { urls, include_raw_html = false, extract_images = false },
  ) => {
    console.log(`🔍 Web fetch: ${urls.join(", ")}`);

    try {
      const settled = await Promise.allSettled(
        urls.map((url) =>
          client.fetch({
            url,
            renderJs: true,
            includeRawHtml: include_raw_html,
            extractImages: extract_images,
          }),
        ),
      );

      const results = settled.map((res, i) => {
        const url = urls[i];
        if (res.status === "fulfilled") {
          const value = res.value as {
            markdown: string;
            rawHtml?: string;
            images?: { url: string; alt?: string }[];
          };
          return {
            url,
            markdown: value.markdown,
            ...(extract_images && value.images ? { images: value.images } : {}),
            ...(include_raw_html && value.rawHtml
              ? { rawHtml: value.rawHtml }
              : {}),
          };
        }
        const err = res.reason;
        let message: string;
        if (err instanceof LinkupFetchResponseTooLargeError) {
          message = `Page is too large to fetch: ${err.message}`;
        } else if (err instanceof LinkupFetchUnsupportedContentTypeError) {
          message = `Unsupported content type: ${err.message}`;
        } else if (err instanceof LinkupFetchError) {
          message = `Fetch failed: ${err.message}`;
        } else if (err instanceof LinkupInvalidRequestError) {
          message = `Invalid URL: ${err.message}`;
        } else if (err instanceof LinkupAuthenticationError) {
          message = `Linkup authentication failed: ${err.message}`;
        } else {
          message = err?.message ?? "Unknown error";
        }
        return { url, error: message };
      });

      const allFailed = results.every((r) => "error" in r);
      if (allFailed) {
        return toolError(
          `All fetches failed: ${results
            .map((r) => `${r.url}: ${(r as { error: string }).error}`)
            .join("; ")}`,
        );
      }

      return results;
    } catch (error: any) {
      console.error("❌ Fetch error:", error);
      return toolError(`Fetch failed: ${error.message ?? "Unknown error"}.`);
    }
  },
});
