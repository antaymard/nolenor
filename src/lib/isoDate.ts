// L'implémentation vit dans `convex/lib/isoDate` : le serveur convertit aussi
// les cellules de table quand une colonne change de type (cf.
// `convex/lib/tableOps.ts`), et les deux côtés doivent lire une date pareil.
export {
  coerceToIsoDate,
  formatAbsoluteDate,
  parseIsoDate,
  toIsoDate,
} from "@/../convex/lib/isoDate";
