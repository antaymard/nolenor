import type { ToolSet } from "ai";

export function sanitizeComposioTools(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: async (args: unknown, options: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (tool as any).execute(args, options);
          return JSON.stringify(result);
        },
      },
    ])
  );
}
