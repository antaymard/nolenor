// Réexport : l'implémentation vit dans `src/lib/isoDate.ts`, partagée avec les
// cellules de table et l'import CSV, qui en avaient chacun leur copie — dont
// une buggée sur les fuseaux.
export {
  toIsoDate,
  parseIsoDate,
  formatAbsoluteDate,
} from "@/lib/isoDate";
