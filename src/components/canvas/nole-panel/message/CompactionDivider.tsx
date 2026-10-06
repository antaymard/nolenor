/**
 * Marque l'endroit où Nolë a résumé la conversation : au-dessus, il ne voit
 * plus les messages eux-mêmes mais leur résumé. Les messages restent affichés.
 */
export function CompactionDivider() {
  return (
    <div
      className="flex items-center gap-3 text-[11px] text-slate-400"
      title="Nolë now works from a summary of the messages above"
    >
      <div className="h-px flex-1 border-t border-dashed border-slate-300" />
      <span>Earlier conversation summarized</span>
      <div className="h-px flex-1 border-t border-dashed border-slate-300" />
    </div>
  );
}
