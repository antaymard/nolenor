import type { BaseFieldProps } from "@/types/ui";
import { useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

type ImageValueType = {
  url: string;
};

export default function ImageField({
  value,
  visualSettings,
  visualType,
}: BaseFieldProps<ImageValueType[]>) {
  const imageUrl = value && value.length > 0 ? value[0].url : "";
  const imageSettings = visualSettings as
    | {
        enableInImageNavigation?: boolean;
      }
    | undefined;
  const canNavigateInImage =
    visualType === "window" && Boolean(imageSettings?.enableInImageNavigation);

  if (!value || value.length === 0) {
    return (
      <div className="aspect-video border-2 border-dashed flex items-center justify-center rounded-md">
        <p className="text-muted-foreground">Ajouter une image</p>
      </div>
    );
  }

  return (
    <div
      className={
        canNavigateInImage
          ? "group/imagefield relative flex h-full w-full overflow-hidden"
          : "group/imagefield relative"
      }
    >
      {canNavigateInImage ? (
        <NavigatingImage imageUrl={imageUrl} />
      ) : (
        <img
          src={imageUrl}
          alt="Selected"
          className="w-full h-auto rounded-md"
        />
      )}
    </div>
  );
}

function NavigatingImage({ imageUrl }: { imageUrl: string }) {
  const containerRef = useState<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerNode, setContainerNode] = containerRef;

  useEffect(() => {
    if (!containerNode) return;

    const updateSize = () => {
      setViewportSize({
        width: containerNode.clientWidth,
        height: containerNode.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerNode);

    return () => observer.disconnect();
  }, [containerNode]);

  useEffect(() => {
    if (!imageUrl) return;

    const image = new Image();
    image.onload = () => {
      setImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.src = imageUrl;
  }, [imageUrl]);

  const fitScale =
    viewportSize.width > 0 &&
    viewportSize.height > 0 &&
    imageSize.width > 0 &&
    imageSize.height > 0
      ? Math.min(
          viewportSize.width / imageSize.width,
          viewportSize.height / imageSize.height,
        )
      : 1;

  return (
    <div className="h-full w-full overflow-hidden" ref={setContainerNode}>
      {imageSize.width > 0 && imageSize.height > 0 && (
        <TransformWrapper
          key={`${imageUrl}-${viewportSize.width}-${viewportSize.height}`}
          initialScale={fitScale}
          minScale={Math.min(fitScale, 1)}
          centerOnInit
          centerZoomedOut
          panning={{ velocityDisabled: true }}
          doubleClick={{ disabled: true }}
        >
          <TransformComponent
            wrapperClass="nodrag h-full w-full overflow-hidden"
            wrapperStyle={{ width: "100%", height: "100%" }}
          >
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              style={{
                width: imageSize.width,
                height: imageSize.height,
                maxWidth: "none",
                maxHeight: "none",
              }}
            />
          </TransformComponent>
        </TransformWrapper>
      )}
    </div>
  );
}
