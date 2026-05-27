import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import {
  LinkupAuthenticationError,
  LinkupClient,
  LinkupInsufficientCreditError,
  LinkupInvalidRequestError,
  LinkupNoResultError,
  LinkupPaymentRequiredError,
  LinkupTooManyRequestsError,
} from "linkup-sdk";
import { ToolConfig, toolError } from "./toolHelpers";
import { toolAgentNames } from "../agentConfig";

export const websearchToolConfig: ToolConfig = {
  name: "websearch",
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

export const websearchTool = createTool({
  description:
    "Search the web for relevant information via Linkup. Returns a list of relevant pages with titles, URLs, and content excerpts.",
  inputSchema: z.object({
    explanation: z
      .string()
      .describe("3-5 words explaining the research intent."),
    query: z
      .string()
      .describe(
        "Natural-language search query (Linkup performs agentic search — phrase it as you would phrase a question, not as keywords). Maximum ~5000 chars. Choose the language depending on the user's language and the type of info needed (e.g. use French for France-specific queries). \nExample: 'When was the UN founded? Prefer official UN sources.'",
      ),
    depth: z
      .enum(["standard", "deep"])
      .default("standard")
      .describe(
        "Search depth. Use 'standard' for straightforward queries with likely direct answers — facts, definitions, simple explanations — single iteration of agentic search (default, fast and cheap). Use 'deep' for (1) complex queries requiring comprehensive analysis or synthesis, (2) queries with uncommon terms, specialized jargon, or abbreviations, or (3) questions requiring up-to-date or specialized info — several iterations of agentic search, slower and ~10× more expensive.",
      ),
    max_results: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Max number of results to return. Defaults to 10 if omitted.",
      ),
    include_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Restrict results to these domains (e.g. ['un.org', 'who.int']). Use when you know the authoritative sources for the topic.",
      ),
    exclude_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Exclude these domains from results (e.g. ['reddit.com', 'quora.com'] for high-trust topics).",
      ),
    from_date: z
      .string()
      .optional()
      .describe(
        "Only include results published on or after this date (ISO format YYYY-MM-DD). Use for time-sensitive topics (recent news, current pricing, latest releases).",
      ),
    to_date: z
      .string()
      .optional()
      .describe(
        "Only include results published on or before this date (ISO format YYYY-MM-DD).",
      ),
  }),
  execute: async (
    ctx,
    {
      query,
      depth = "standard",
      max_results,
      include_domains,
      exclude_domains,
      from_date,
      to_date,
    },
  ) => {
    console.log(`🔍 Web search: "${query}" depth=${depth}`);

    try {
      const response = await client.search({
        query,
        depth,
        outputType: "searchResults",
        maxResults: max_results ?? 10,
        ...(include_domains && include_domains.length > 0
          ? { includeDomains: include_domains }
          : {}),
        ...(exclude_domains && exclude_domains.length > 0
          ? { excludeDomains: exclude_domains }
          : {}),
        ...(from_date ? { fromDate: new Date(from_date) } : {}),
        ...(to_date ? { toDate: new Date(to_date) } : {}),
      });

      if (!response.results || response.results.length === 0) {
        return toolError(`No results found for: "${query}"`);
      }

      console.log(
        `✅ Web search complete with ${response.results.length} results.`,
      );
      return response.results;
    } catch (error: any) {
      console.error("❌ Search error:", error);
      if (error instanceof LinkupNoResultError) {
        return toolError(`No results found for: "${query}"`);
      }
      if (error instanceof LinkupAuthenticationError) {
        return toolError(`Linkup authentication failed: ${error.message}`);
      }
      if (error instanceof LinkupInvalidRequestError) {
        return toolError(`Invalid search request: ${error.message}`);
      }
      if (
        error instanceof LinkupPaymentRequiredError ||
        error instanceof LinkupInsufficientCreditError
      ) {
        return toolError(
          `Linkup quota exceeded: ${error.message}. Contact your administrator.`,
        );
      }
      if (error instanceof LinkupTooManyRequestsError) {
        return toolError(
          `Rate limit hit: ${error.message}. Please retry shortly.`,
        );
      }
      return toolError(
        `Search failed: ${error.message ?? "Unknown error"}. Please try rephrasing your query.`,
      );
    }
  },
});
