import { useState } from "react";
import type { BaseFieldProps } from "@/types/ui";
import { TbLink } from "react-icons/tb";
import { Input } from "../shadcn/input";
import { Button } from "../shadcn/button";
import toast from "react-hot-toast";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";

export type LinkValueType = {
  href: string;
  pageTitle: string;
  pageImage?: string;
  pageDescription?: string;
  siteName?: string;
};

// Composant pour édition dans un Popover (utilisé par LinkNode)
export function LinkEditionPopover({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (value: LinkValueType) => void;
}) {
  const [linkUrl, setLinkUrl] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const fetchLinkMetadata = useAction(api.links.fetchLinkMetadata);

  const handleSave = async () => {
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

      onSave({
        href: url,
        pageTitle: metadata.title || url,
        pageImage: metadata.image || "",
        pageDescription: metadata.description || "",
        siteName: "",
      });
    } catch {
      toast.error("Unable to fetch page title");
      // Sauvegarder quand même avec l'URL comme titre
      onSave({ href: url, pageTitle: url });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        onDoubleClick={(e) => e.stopPropagation()}
        type="text"
        placeholder="https://..."
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
      />
      <Button onClick={handleSave} disabled={isLoading} size="sm">
        {isLoading ? "Loading..." : "Save"}
      </Button>
    </div>
  );
}

interface LinkFieldProps extends BaseFieldProps<LinkValueType> {
  className?: string;
}

function LinkField({ value, className = "", componentProps }: LinkFieldProps) {
  const { iconOnly } = componentProps || {};

  const linkValue: LinkValueType = (value as LinkValueType) || {
    href: "",
    pageTitle: "",
  };

  return (
    <div
      className={cn(
        "relative bg-muted hover:bg-accent h-8 rounded-md flex items-center group/linkfield px-2 gap-2 min-w-0 ",
        iconOnly ? "w-8" : "flex-1 w-full",
        className,
      )}
    >
      {linkValue?.href ? (
        <a
          href={value?.href}
          target="_blank"
          className={`flex items-center gap-2 min-w-0 flex-1 cursor-pointer ${linkValue?.href ? "" : "opacity-50"} ${
            iconOnly ? "justify-center" : ""
          }`}
        >
          <TbLink size={18} className="shrink-0" />

          <p className="truncate hover:underline flex-1 min-w-0">
            {linkValue.pageTitle || <i>No title</i>}
          </p>
        </a>
      ) : (
        "No link"
      )}
    </div>
  );
}

export default LinkField;
