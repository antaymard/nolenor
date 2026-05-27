import type { ToolCardProps } from "@/types/message.types";
import { TbWorldSearch } from "react-icons/tb";
import ToolCardFrame from "./ToolCardFrame";

interface WebSearchInput {
  query: string;
  depth?: "standard" | "deep";
  max_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  from_date?: string;
  to_date?: string;
}
interface WebSearchResult {
  type: "text" | "image";
  name: string;
  url: string;
  content?: string;
  favicon?: string;
}
type WebsearchToolCardProps = ToolCardProps<WebSearchInput, WebSearchResult[]>;

export default function WebsearchToolCard({
  state,
  input,
  output,
}: WebsearchToolCardProps) {
  const filters: string[] = [];
  if (input?.include_domains?.length)
    filters.push(`only ${input.include_domains.join(", ")}`);
  if (input?.exclude_domains?.length)
    filters.push(`except ${input.exclude_domains.join(", ")}`);
  if (input?.from_date) filters.push(`from ${input.from_date}`);
  if (input?.to_date) filters.push(`to ${input.to_date}`);

  return (
    <ToolCardFrame
      icon={TbWorldSearch}
      name="Web search"
      state={state}
      canBeExpanded={true}
      detailLabel={`${output?.length ?? 0} results`}
    >
      <div className="flex flex-col divide-y divide-white/20 -mx-2 text-white">
        {input?.query && (
          <div className="p-2 pb-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p>Search query</p>
              {input?.depth && (
                <p className="text-xs! px-1.5 py-0.5 rounded-sm bg-white/50 text-primary">
                  {input.depth}
                </p>
              )}
            </div>
            <p className="text-sm! text-white/70 -mt-2">{input.query}</p>
            {filters.length > 0 && (
              <p className="text-xs! text-white/60">{filters.join(" · ")}</p>
            )}
          </div>
        )}
        {output?.map((result, index) => (
          <div key={index} className="p-2 pt-2.5">
            <a
              href={result.url}
              target="_blank"
              className="hover:underline underline-offset-2"
            >
              <p>{result.name}</p>
            </a>
            <div className="text-sm leading-tight text-white/60">
              <p>{new URL(result.url).hostname}</p>
            </div>
          </div>
        ))}
      </div>
    </ToolCardFrame>
  );
}
