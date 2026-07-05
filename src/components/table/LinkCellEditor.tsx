import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import toast from "react-hot-toast";
import { TbLink, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";
import type { CellValue, LinkCellValue } from "./types";

export interface LinkCellEditorProps {
  value: LinkCellValue | null | undefined;
  isEditing: boolean;
  onClick: () => void;
  onChange: (val: CellValue) => void;
  onBlur: () => void;
}

export function LinkCellEditor({
  value,
  isEditing,
  onClick,
  onChange,
  onBlur,
}: LinkCellEditorProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fetchLinkMetadata = useAction(api.links.fetchLinkMetadata);

  const handleOpen = () => {
    setLinkUrl(value?.href ?? "");
    setLinkTitle(value?.pageTitle ?? "");
  };

  const handleSave = async () => {
    let url = linkUrl.trim();
    if (!url) {
      onChange(null);
      onBlur();
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    try {
      new URL(url);
    } catch {
      toast.error("URL invalide");
      return;
    }
    setIsLoading(true);
    try {
      const metadata = await fetchLinkMetadata({ url });
      onChange({
        href: url,
        pageTitle: linkTitle.trim() || metadata.title || url,
        pageImage: metadata.image || undefined,
        pageDescription: metadata.description || undefined,
      });
    } catch {
      onChange({ href: url, pageTitle: linkTitle.trim() || url });
    } finally {
      setIsLoading(false);
      onBlur();
    }
  };

  let displayLabel = value?.pageTitle ?? "";
  if (!displayLabel && value?.href) {
    try {
      displayLabel = new URL(value.href).hostname.replace(/^www\./, "");
    } catch {
      displayLabel = value.href;
    }
  }

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (open) handleOpen();
        if (!open) onBlur();
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={cn(
            "flex items-center gap-1 w-full min-h-[1.4em] rounded px-1 cursor-pointer hover:bg-muted/50",
          )}
          onClick={onClick}
        >
          {displayLabel ? (
            <>
              <TbLink size={13} className="shrink-0 text-muted-foreground" />
              <a
                href={value!.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--brand) hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {displayLabel}
              </a>
            </>
          ) : (
            <span className="text-muted-foreground">Add a link…</span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            type="url"
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") onBlur();
            }}
            disabled={isLoading}
          />
          <Input
            type="text"
            placeholder="Titre (optionnel)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") onBlur();
            }}
            disabled={isLoading}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? "Chargement…" : "Enregistrer"}
            </Button>
            {value?.href && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onChange(null);
                  onBlur();
                }}
              >
                <TbTrash size={14} />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
