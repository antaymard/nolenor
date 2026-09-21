import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import toast from "react-hot-toast";
import { TbPencil } from "react-icons/tb";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { extractIframeSrc } from "@/../convex/lib/embedUrl";
import { WindowEditTrigger } from "./WindowEditTrigger";
import type { NodeEditTriggerVariant } from "./WindowEditTrigger";

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

interface LinkEditControlProps {
  nodeDataId: Id<"nodeDatas"> | undefined;
  variant?: NodeEditTriggerVariant;
}

/**
 * Bouton Edit + popover d'édition d'un lien, partagé entre la toolbar du node
 * canvas et le header des windows (flottante — `link` n'est pas éligible au
 * plein écran). Le contenu du popover vit ici une seule fois (DRY).
 */
export function LinkEditControl({
  nodeDataId,
  variant = "toolbar",
}: LinkEditControlProps) {
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const fetchLinkMetadata = useAction(api.links.fetchLinkMetadata);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const linkValue = (values?.link as LinkValueType | undefined) ?? defaultValue;

  const handleSave = async () => {
    if (!nodeDataId) return;

    // Un snippet `<iframe>` collé est réduit à son `src` : `href` ne stocke
    // jamais de HTML, et toute la chaîne en aval (LinkPreview, résumé Parallel,
    // chunking) continue de ne voir que des URLs.
    let url = extractIframeSrc(linkUrl) ?? linkUrl.trim();

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
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        {variant === "toolbar" ? (
          <NodeToolbarButton label="Edit" title="Edit link">
            <TbPencil />
          </NodeToolbarButton>
        ) : (
          <WindowEditTrigger title="Edit link" />
        )}
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isLoading) void handleSave();
          }}
        >
          <Input
            onDoubleClick={(e) => e.stopPropagation()}
            type="text"
            placeholder="URL or <iframe> embed code..."
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
          <Button type="submit" disabled={isLoading} size="sm">
            {isLoading ? "Loading..." : "Save"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
