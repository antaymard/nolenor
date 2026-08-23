import { memo, useState } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  TbLink,
  TbExternalLink,
  TbPencil,
  TbCopy,
  TbCopyCheck,
} from "react-icons/tb";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import toast from "react-hot-toast";
import type { XyNodeProps } from "@/types/domain";

export type LinkValueType = {
  href: string;
  pageTitle: string;
  pageImage?: string;
  pageDescription?: string;
  siteName?: string;
};

const defaultValue: LinkValueType = {
  href: "",
  pageTitle: "",
};

function LinkNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (!linkValue.href) return;
    try {
      await navigator.clipboard.writeText(linkValue.href);
      setIsCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Unable to copy link");
    }
  };
  const fetchLinkMetadata = useAction(api.links.fetchLinkMetadata);

  const linkValue = (values?.link as LinkValueType | undefined) ?? defaultValue;
  const isPreview = xyNode.data.variant === "preview";

  const handleSave = async () => {
    if (!nodeDataId) return;

    let url = linkUrl.trim();

    // Ajouter https:// si absent
    if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    // Valider le format URL
    try {
      new URL(url);
    } catch {
      toast.error("Invalid URL");
      return;
    }

    // Récupérer le titre de la page via l'API
    setIsLoading(true);
    try {
      const metadata = await fetchLinkMetadata({ url });

      updateNodeDataValues({
        nodeDataId,
        values: {
          link: {
            href: url,
            pageTitle: linkTitle.trim() || metadata.title || url,
            pageImage: metadata.image || "",
            pageDescription: metadata.description || "",
            siteName: "",
          },
        },
      });
      setIsPopoverOpen(false);
      setLinkUrl("");
      setLinkTitle("");
    } catch {
      toast.error("Unable to fetch page title");
      // Sauvegarder quand même avec l'URL comme titre
      updateNodeDataValues({
        nodeDataId,
        values: { link: { href: url, pageTitle: linkTitle.trim() || url } },
      });
      setIsPopoverOpen(false);
      setLinkUrl("");
      setLinkTitle("");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      setLinkUrl(linkValue.href);
      setLinkTitle(linkValue.pageTitle);
    }
  };

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="Edit link">
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="Title (optional)"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
              />
              <Button onClick={handleSave} disabled={isLoading} size="sm">
                {isLoading ? "Loading..." : "Save"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {linkValue.href && (
          <Button
            variant="outline"
            size="icon"
            title="Copy link URL"
            onClick={handleCopyUrl}
          >
            {isCopied ? <TbCopyCheck /> : <TbCopy />}
          </Button>
        )}
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode} resizable={isPreview}>
        {isPreview ? (
          linkValue.href ? (
            <div className="link-preview-container flex flex-col h-full overflow-hidden">
              <div className="relative w-full flex-1 min-h-0 overflow-hidden bg-muted">
                {linkValue.pageImage ? (
                  <img
                    src={linkValue.pageImage}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (
                        e.currentTarget.parentElement as HTMLElement
                      ).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-muted/50">
                    <TbLink size={32} className="text-muted-foreground" />
                  </div>
                )}
                <a
                  href={linkValue.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white rounded-sm px-2 py-1 text-xs cursor-pointer transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${(() => {
                      try {
                        return new URL(linkValue.href).hostname;
                      } catch {
                        return "";
                      }
                    })()}&sz=16`}
                    alt=""
                    className="w-4 h-4"
                  />
                  <span>
                    {(() => {
                      try {
                        return new URL(linkValue.href).hostname.replace(
                          /^www\./,
                          "",
                        );
                      } catch {
                        return linkValue.href;
                      }
                    })()}
                  </span>
                  <TbExternalLink size={12} />
                </a>
              </div>
              <div className="flex flex-col gap-1 px-3 py-2.5 min-w-0 shrink-0">
                <p className="font-medium leading-tight line-clamp-3">
                  {linkValue.pageTitle || linkValue.href}
                </p>
                {linkValue.pageDescription && (
                  <p className="link-preview-description text-muted-foreground leading-snug line-clamp-3">
                    {linkValue.pageDescription}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <TbLink size={24} className="mr-2" />
              No link
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 px-2 min-w-0 h-full group/linknode relative">
            {linkValue.href ? (
              <>
                <TbLink size={18} className="shrink-0" />
                <p
                  className="truncate flex-1 min-w-0"
                  title={linkValue.pageTitle || linkValue.href}
                >
                  {linkValue.pageTitle || <i>No title</i>}
                </p>
                {xyNode.selected && (
                  <a
                    href={linkValue.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-background hover:bg-muted rounded-sm p-1 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TbExternalLink size={16} />
                  </a>
                )}
              </>
            ) : (
              <span className="text-muted-foreground flex items-center gap-2">
                <TbLink size={18} className="shrink-0" />
                No link
              </span>
            )}
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(LinkNode, areNodePropsEqual);
