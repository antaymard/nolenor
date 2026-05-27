import type { ToolCardProps } from "@/types/message.types";
import { TbPointer } from "react-icons/tb";
import ToolCardFrame from "./ToolCardFrame";

interface OpenWebpageInput {
  urls: string[];
  include_raw_html?: boolean;
  extract_images?: boolean;
}
interface OpenWebpageResult {
  url: string;
  markdown?: string;
  rawHtml?: string;
  images?: { url: string; alt?: string }[];
  error?: string;
}
type OpenWebpageToolCardProps = ToolCardProps<
  OpenWebpageInput,
  OpenWebpageResult[]
>;

export default function OpenWebpageToolCard({
  state,
  input,
  output,
}: OpenWebpageToolCardProps) {
  return (
    <ToolCardFrame
      icon={TbPointer}
      name="Web page navigation"
      state={state}
      canBeExpanded={true}
      detailLabel={`${output?.length ?? input?.urls.length ?? 0} URLs`}
    >
      <div className="flex flex-col divide-y divide-white/20 -mx-2 text-white">
        {output?.map((result, index) => (
          <div key={index} className="p-2">
            <a
              href={result.url}
              target="_blank"
              className="hover:underline underline-offset-2"
            >
              <p>{new URL(result.url).hostname}</p>
            </a>
            {result.error && (
              <p className="text-sm text-red-300/80 leading-tight mt-1">
                {result.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </ToolCardFrame>
  );
}
