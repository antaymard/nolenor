import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import Parallel from "parallel-web";

import { type ToolConfig, toolError } from "./toolHelpers";
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

const client = new Parallel({
  apiKey: process.env.PARALLEL_API_KEY!,
});

export const openWebPageTool = createTool({
  description:
    "Convert any public URL into clean, LLM-optimized markdown. It converts any public URL into clean markdown, including JavaScript-heavy pages and PDFs. It returns focused excerpts aligned to the objective, or full page content if requested.",
  inputSchema: z.object({
    explanation: z
      .string()
      .describe("3-5 words explaining the research intent."),
    urls: z
      .array(z.string())
      .describe(
        "List of URLs to extract content from. Maximum 10 URLs per request. \nExample: ['https://example.com/article1', 'https://example.com/article2']",
      ),
    objective: z
      .string()
      .describe(
        "THIS MUST BE IN ENGLISH. Natural-language description of what information you're looking for, including broader task context. When provided, focuses extracted content on relevant information. Maximum 3000 characters. \nExample: I'm researching React performance optimization. Find best practices for preventing unnecessary re-renders.",
      ),
    search_queries: z
      .array(z.string())
      .describe(
        "THIS MUST BE IN ENGLISH. Optional keyword queries to focus extraction. Use with or without objective to emphasize specific terms. \nExample: ['React.memo', 'useMemo', 'useCallback']",
      )
      .optional(),
  }),
  execute: async (ctx, { urls, objective, search_queries = [] }) => {
    console.log(`🔍 Web extract: ${objective}, ${urls.join(", ")}`);

    try {
      const search = await client.beta.extract({
        urls,
        search_queries,
        excerpts: true,
        full_content: true,
      });

      if (!search.results || search.results.length === 0) {
        return toolError(`No results found for: "${objective}"`);
      }

      return search.results;
    } catch (error: any) {
      console.error("❌ Extract error:", error);
      return toolError(
        `Extraction failed: ${error.message}. Please try rephrasing your query.`,
      );
    }
  },
});
