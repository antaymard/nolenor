// Premier jour de la semaine, déduit de la locale du navigateur.
//
// `components/shadcn/calendar.tsx` portait un `// weekStartsOn={1} // Use local
// instead` commenté : l'intention de déférer à la locale était déjà écrite,
// mais le `locale={enUS}` câblé juste en dessous la court-circuitait, et tout
// le monde se retrouvait en semaine commençant le dimanche — y compris les
// navigateurs qui disaient lundi. C'est ce fichier qui la réalise.

/** Convention de react-day-picker et de date-fns : 0 = dimanche … 6 = samedi. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Repli quand la locale ne dit rien : Firefox n'expose l'information qu'à
 * partir de la 153, et une locale exotique peut ne rien porter.
 *
 * Lundi et non dimanche : c'est la norme partout hors Amérique du Nord, et le
 * dimanche d'avant n'avait jamais été choisi — il tombait du `enUS` câblé.
 */
const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

/**
 * `Intl.Locale` expose l'info sous deux formes selon l'âge du moteur : Chrome
 * (99+) et Safari (15.4+) ont d'abord livré un accesseur `weekInfo`, puis la
 * spec a tranché pour une méthode `getWeekInfo()` (Chrome 130, Safari 17,
 * Firefox 153). On essaie la méthode, puis l'accesseur.
 *
 * Le cast passe par `unknown` parce que `getWeekInfo` est déclaré ou non sur
 * `Intl.Locale` selon le `lib.*.d.ts` embarqué par TypeScript : on ne veut pas
 * que la compilation du projet dépende de ce détail.
 */
type LocaleWeekInfo = {
  getWeekInfo?: () => { firstDay?: number };
  weekInfo?: { firstDay?: number };
};

function readLocaleFirstDay(): number | undefined {
  // `navigator` absent (import hors navigateur) lève ici : le catch de
  // `detectWeekStartsOn` reprend la main.
  const locale = new Intl.Locale(
    navigator.language,
  ) as unknown as LocaleWeekInfo;

  return (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
}

/**
 * Premier jour de la semaine de la locale courante.
 *
 * `Intl` numérote les jours en ISO — 1 = lundi … 7 = dimanche — là où
 * react-day-picker et date-fns comptent 0 = dimanche … 6 = samedi. Le `% 7`
 * fait le pont : il ne touche à rien entre 1 et 6, et ramène 7 sur 0.
 */
export function detectWeekStartsOn(): WeekStartsOn {
  try {
    const firstDay = readLocaleFirstDay();

    if (
      typeof firstDay === "number" &&
      Number.isInteger(firstDay) &&
      firstDay >= 1 &&
      firstDay <= 7
    ) {
      return (firstDay % 7) as WeekStartsOn;
    }
  } catch {
    // Locale malformée, `Intl.Locale` indisponible, `navigator` absent : aucun
    // de ces cas ne mérite de casser un date picker.
  }

  return DEFAULT_WEEK_STARTS_ON;
}

/**
 * Résolu une fois au chargement du module : `navigator.language` ne change pas
 * sans rechargement de la page, alors qu'un date picker peut monter à chaque
 * clic dans un popover.
 */
export const WEEK_STARTS_ON: WeekStartsOn = detectWeekStartsOn();
