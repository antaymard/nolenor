import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { TbPhoto, TbTrash } from "react-icons/tb";
import {
  CANVAS_COLORS,
  MAX_CANVAS_ICON_LENGTH,
} from "@/../convex/schemas/canvasesSchema";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  CANVAS_COVERS,
  CANVAS_COVER_DOTS_STYLE,
  EMOJI_FONT_STYLE,
  canvasCover,
  canvasGlyph,
} from "@/lib/canvasCover";
import { cn } from "@/lib/utils";
import {
  CANVAS_COVER_ACCEPT,
  MAX_CANVAS_COVER_BYTES,
  coverDraftPreviewUrl,
  firstGrapheme,
  type CanvasCoverDraft,
  type CanvasIdentityDraft,
} from "./canvasAppearanceDraft";

/** Icônes proposées d'un clic ; n'importe quel emoji se colle dans le champ. */
const CANVAS_ICONS = [
  "🚀",
  "💡",
  "📝",
  "📚",
  "🎯",
  "🧠",
  "🛠️",
  "🎨",
  "📈",
  "💰",
  "🗂️",
  "📅",
  "🌱",
  "🔬",
  "🧪",
  "🧩",
  "💼",
  "🤝",
  "📣",
  "🎓",
  "🏠",
  "✈️",
  "🗺️",
  "🌍",
  "🎬",
  "🎵",
  "📦",
  "⚙️",
  "🏗️",
  "🔥",
  "⭐",
  "❤️",
];

/**
 * Icône (un emoji) et couleur d'un canvas, purement contrôlé. La tuile montre
 * le rendu final — la même que dans la sidebar et sur la home — et ouvre le
 * choix d'icône ; les pastilles à côté choisissent la couleur.
 */
export function CanvasIdentityField({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: CanvasIdentityDraft;
  onChange: (next: CanvasIdentityDraft) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customIcon, setCustomIcon] = useState("");
  const cover = canvasCover(value.color);

  const pickIcon = (icon: string | undefined) => {
    onChange({ ...value, icon });
    setCustomIcon("");
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label>Icon & color</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Choose an icon"
              title="Choose an icon"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-50",
                value.icon ? "text-xl" : "text-base",
                cover.tile,
              )}
              style={value.icon ? EMOJI_FONT_STYLE : undefined}
            >
              {canvasGlyph({ name, icon: value.icon })}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="grid grid-cols-8 gap-0.5">
              {CANVAS_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={cn(
                    "flex size-8 items-center justify-center rounded text-lg leading-none hover:bg-muted",
                    value.icon === emoji && "bg-muted ring-1 ring-slate-300",
                  )}
                  style={EMOJI_FONT_STYLE}
                  onClick={() => pickIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 border-t pt-2">
              <Input
                value={customIcon}
                onChange={(event) => setCustomIcon(event.target.value)}
                onKeyDown={(event) => {
                  // Le popover est porté hors du DOM de la modale, mais pas
                  // hors de son arbre React : sans ça, Entrée soumettrait le
                  // <form> de la modale au lieu de valider l'emoji.
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const icon = firstGrapheme(customIcon);
                  if (icon) pickIcon(icon);
                }}
                maxLength={MAX_CANVAS_ICON_LENGTH}
                placeholder="Paste any emoji"
                aria-label="Custom emoji"
                className="h-8 text-sm"
                style={EMOJI_FONT_STYLE}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!firstGrapheme(customIcon)}
                onClick={() => pickIcon(firstGrapheme(customIcon))}
              >
                Use
              </Button>
            </div>
            {value.icon && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 w-full justify-start text-muted-foreground"
                onClick={() => pickIcon(undefined)}
              >
                Remove icon (use the initial)
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <div
          role="radiogroup"
          aria-label="Canvas color"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={value.color === undefined}
            title="No color"
            aria-label="No color"
            disabled={disabled}
            onClick={() => onChange({ ...value, color: undefined })}
            className={cn(
              "size-6 rounded-full border border-dashed border-slate-400 bg-white disabled:opacity-50",
              value.color === undefined && "ring-2 ring-slate-900 ring-offset-2",
            )}
          />
          {CANVAS_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={value.color === color}
              title={CANVAS_COVERS[color].label}
              aria-label={CANVAS_COVERS[color].label}
              disabled={disabled}
              onClick={() => onChange({ ...value, color })}
              className={cn(
                "size-6 rounded-full disabled:opacity-50",
                CANVAS_COVERS[color].tile,
                value.color === color && "ring-2 ring-slate-900 ring-offset-2",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Image de couverture du canvas sur la home, purement contrôlé : le fichier
 * choisi reste local (aperçu sur une URL `blob:`) jusqu'au save de l'appelant.
 */
export function CanvasCoverField({
  value,
  onChange,
  tintClassName,
  disabled = false,
}: {
  value: CanvasCoverDraft;
  onChange: (next: CanvasCoverDraft) => void;
  /** Fond de l'aperçu sans image : la teinte que la carte aura sur la home. */
  tintClassName: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = coverDraftPreviewUrl(value);

  // L'URL locale d'un fichier ne sert que tant qu'il est le brouillon : on
  // libère la précédente quand il change. Pas au démontage — la section
  // repliable de la modale démonte ce champ sans que le brouillon disparaisse.
  const localUrl = value.kind === "file" ? value.previewUrl : null;
  const previousLocalUrl = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousLocalUrl.current;
    if (previous && previous !== localUrl) URL.revokeObjectURL(previous);
    previousLocalUrl.current = localUrl;
  }, [localUrl]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      toast.error("Choose a PNG, JPEG, WebP, GIF or AVIF image.");
      return;
    }
    if (file.size > MAX_CANVAS_COVER_BYTES) {
      toast.error("This image is too large (5 MB max).");
      return;
    }
    onChange({ kind: "file", file, previewUrl: URL.createObjectURL(file) });
  };

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative h-24 overflow-hidden rounded-xl border border-slate-200",
          tintClassName,
        )}
        style={previewUrl ? undefined : CANVAS_COVER_DOTS_STYLE}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Cover preview"
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={CANVAS_COVER_ACCEPT}
          className="hidden"
          onChange={(event) => {
            pickFile(event.target.files?.[0]);
            // Permet de rechoisir le même fichier après l'avoir retiré.
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <TbPhoto />
          {previewUrl ? "Replace image" : "Upload image"}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ kind: "none" })}
          >
            <TbTrash />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
