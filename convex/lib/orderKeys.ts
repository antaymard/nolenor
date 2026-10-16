/**
 * Clés d'ordre fractionnaires : des chaînes qui se trient dans l'ordre
 * lexicographique, et entre deux desquelles on peut toujours en insérer une.
 *
 * Insérer un élément entre deux autres n'écrit donc que lui — ni ses voisins
 * à renuméroter, ni conflit entre deux insertions simultanées au même
 * endroit (au pire, deux clés égales, départagées par l'appelant).
 *
 * Alphabet base 36, comparé octet à octet (`<` sur les chaînes) : les
 * chiffres précèdent les lettres en ASCII, l'ordre des clés est donc celui
 * de l'alphabet. Une clé produite ici ne finit jamais par `0` : c'est ce qui
 * garantit qu'il reste toujours de la place avant elle.
 */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

/**
 * Une clé strictement entre `before` et `after` (`null` = pas de borne de ce
 * côté). Lève si `before >= after` : l'appelant a mal trié ses voisins.
 */
export function orderKeyBetween(
  before: string | null,
  after: string | null,
): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`orderKeyBetween: "${before}" is not before "${after}"`);
  }
  const low = before ?? "";
  let high = after;
  let key = "";
  for (let i = 0; ; i++) {
    const lowDigit = i < low.length ? DIGITS.indexOf(low[i]) : 0;
    const highDigit =
      high === null ? BASE : i < high.length ? DIGITS.indexOf(high[i]) : 0;
    if (highDigit - lowDigit > 1) {
      return key + DIGITS[Math.floor((lowDigit + highDigit) / 2)];
    }
    key += DIGITS[lowDigit];
    // Chiffres égaux : on avance. Adjacents : `key` est désormais sous
    // `high` quelle que soit la suite, il ne reste qu'à dépasser `low`.
    if (highDigit !== lowDigit) high = null;
  }
}

/** `count` clés croissantes entre `before` et `after`, pour une insertion groupée. */
export function orderKeysBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  const keys: string[] = [];
  let previous = before;
  for (let i = 0; i < count; i++) {
    previous = orderKeyBetween(previous, after);
    keys.push(previous);
  }
  return keys;
}
