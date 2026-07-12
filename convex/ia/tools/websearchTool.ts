import {createTool} from "@convex-dev/agent";
import {z} from "zod";
import Parallel from "parallel-web";
import {type ToolConfig, toolError} from "./toolHelpers";
import {toolAgentNames} from "../agentConfig";

export const websearchToolConfig: ToolConfig = {
  name: "websearch",
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

export const websearchTool = createTool({
  description: "Search the web for relevant information.",
  inputSchema: z.object({
    explanation: z
      .string()
      .describe("3-5 words explaining the research intent."),
    objective: z
      .string()
      .describe(
        "Natural-language description of the web research goal, including source or freshness guidance and broader context from the task. Maximum 5000 characters. Choose the right language, depending on the user's language, and the type of info needed. For example, if local or country specific, use the user language. \nExample:  I want to know when the UN was founded. Prefer UN's websites.",
      ),
    search_queries: z
      .array(z.string())
      .describe(
        "Optional search queries to supplement the objective. Maximum 200 characters per query. Choose the right language, depending on the user's language, and the type of info needed. For example, if local or country specific, use the user language. \nExample: ['Founding year UN', 'Year of founding United Nations']",
      )
      .optional(),
    search_effort: z
      .enum(["low", "medium", "high"])
      .default("low")
      .describe(
        "Determines the number of search results to retrieve, and the conciseness of the summaries. A high effort is token-intensive, but may yield better results for complex queries. If not specified, defaults to 'low'. For complex, niche or ambiguous queries, consider using 'medium' or 'high'. You can start with 'low' and increase if results are insufficient.",
      ),
  }),
  execute: async (
    _ctx,
    { objective, search_queries = [], search_effort = "low" },
  ) => {
    console.log(`🔍 Web search: ${objective} with effort ${search_effort}`);

    try {
      let searchOptions = {};
      switch (search_effort) {
        case "low":
          searchOptions = {
            max_results: 5,
            mode: "agentic",
            excerpts: {
              max_chars_per_result: 500,
            },
          };
          break;
        case "medium":
          searchOptions = {
            max_results: 10,
            mode: "one-shot",
            excerpts: {
              max_chars_per_result: 2000,
            },
          };
          break;
        case "high":
          searchOptions = {
            max_results: 20,
            mode: "one-shot",
            excerpts: {
              max_chars_per_result: 1000,
            },
          };
          break;
      }

      const search = await client.beta.search({
        objective,
        search_queries,
        ...searchOptions,
      });

      if (!search.results || search.results.length === 0) {
        return toolError(`No results found for: "${objective}"`);
      }

      console.log(
        `✅ Web search complete with ${search.results.length} results.`,
      );

      return search.results;
    } catch (error) {
      console.error("❌ Search error:", error);
      const message = error instanceof Error ? error.message : String(error);
      return toolError(
        `Search failed: ${message}. Please try rephrasing your query.`,
      );
    }
  },
});
