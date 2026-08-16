import { TbUpload } from "react-icons/tb";

/**
 * Voile affiché pendant qu'on survole la fenêtre avec un fichier, un lien ou du
 * texte. Purement présentationnel : l'état vit dans `useCanvasDropHandler`, et
 * `pointer-events-none` garantit que l'overlay ne vole jamais le drop.
 */
export default function CanvasDropOverlay() {
  return (
    <div className="animate-appear pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
      <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-slate-400" />
      <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-lg ring-1 ring-slate-200">
        <TbUpload size={20} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-700">
          Déposez pour créer un node
        </span>
      </div>
    </div>
  );
}
