import { memo, useEffect, useRef, useState } from "react";
import ImageField from "@/components/fields/ImageField";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { TbChevronLeft, TbChevronRight } from "react-icons/tb";

interface ImageWindowProps {
  nodeDataId: Id<"nodeDatas">;
}

type ImageWindowValue = Array<{
  url: string;
  inImageNavigation?: {
    scale: number;
    positionX: number;
    positionY: number;
  };
}>;

/**
 * Quelle image on regardait, le temps d'une bascule.
 *
 * Passer en plein écran ne déplace pas la fenêtre : il en démonte une et en
 * monte une autre ailleurs dans l'arbre React. L'état local repart donc de
 * zéro, et une galerie reviendrait à sa première image au moment précis où on
 * demande à mieux voir la neuvième. Même remède que la position de lecture de
 * VideoWindow : une Map de module — l'information ne survit pas à la session,
 * n'intéresse personne d'autre et n'a aucune raison de déclencher un rendu.
 */
const lastIndexByNode = new Map<Id<"nodeDatas">, number>();

function ImageWindow({ nodeDataId }: ImageWindowProps) {
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const value = (nodeDataValues?.images as ImageWindowValue | undefined) ?? [];
  // Lecture seule dans l'initialiseur : StrictMode l'appelle deux fois, et un
  // `delete` posé ici rendrait le second appel bredouille. L'entrée est
  // consommée juste après, dans un effet.
  const [currentIndex, setCurrentIndex] = useState(
    () => lastIndexByNode.get(nodeDataId) ?? 0,
  );

  // Relu au démontage, donc via une ref : le cleanup d'un effet ne verrait que
  // l'index du rendu où il a été créé.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    // La position restaurée est consommée : seule la bascule plein écran la
    // reporte, rouvrir la fenêtre plus tard repart de la première image.
    lastIndexByNode.delete(nodeDataId);

    return () => {
      if (currentIndexRef.current > 0) {
        lastIndexByNode.set(nodeDataId, currentIndexRef.current);
      }
    };
  }, [nodeDataId]);

  useEffect(() => {
    if (value.length > 0 && currentIndex >= value.length) {
      setCurrentIndex(value.length - 1);
    }
  }, [value.length, currentIndex]);

  if (!nodeDataValues) return null;

  const hasMultiple = value.length > 1;

  return (
    <div className="relative h-full w-full">
      <ImageField
        key={currentIndex}
        value={value.length > 0 ? [value[currentIndex]] : []}
        visualType="window"
        visualSettings={{ enableInImageNavigation: true }}
      />

      {hasMultiple && (
        <>
          {currentIndex > 0 && (
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              <TbChevronLeft size={20} />
            </button>
          )}
          {currentIndex < value.length - 1 && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
              onClick={() => setCurrentIndex((i) => i + 1)}
            >
              <TbChevronRight size={20} />
            </button>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/40 text-white text-xs px-2.5 py-0.5 rounded-full z-10 pointer-events-none">
            {currentIndex + 1} / {value.length}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ImageWindow);
