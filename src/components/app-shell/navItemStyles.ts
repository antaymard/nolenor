/**
 * L'entrée de navigation d'une sidebar du shell, et son état actif. Partagée
 * entre la sidebar de l'app et celle des settings, pour qu'on passe de l'une à
 * l'autre sans changer de repères.
 */
export const NAV_ITEM_CLASS =
  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/60";

export const NAV_ITEM_ACTIVE_CLASS =
  "bg-white font-bold text-brand shadow-sm hover:bg-white";
