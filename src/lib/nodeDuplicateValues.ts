import { nodeDataConfig } from "@/../convex/config/nodeConfig";

/**
 * Les values d'un node, moins celles que son type déclare non duplicables.
 *
 * Copier ou dupliquer prend `values` en bloc mais jamais les edges : une value
 * qui ne tient son sens que des connexions du node d'origine arriverait inerte
 * sur la copie, et se rallumerait de façon surprenante si elle venait à être
 * rebranchée sur les mêmes sources. Quelles clés sont dans ce cas est une
 * propriété du type de node, déclarée dans `nodeConfig.ts`
 * (`valuesNotDuplicated`) — pas une liste de cas particuliers cachée dans les
 * call sites. Partagé entre `useDuplicateNode` et le presse-papiers Ctrl+C.
 */
export function valuesToDuplicate(
  nodeType: string | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const excluded = nodeDataConfig.find((config) => config.type === nodeType)
    ?.valuesNotDuplicated;
  if (!excluded || excluded.length === 0) return values;

  const copy = { ...values };
  for (const key of excluded) delete copy[key];
  return copy;
}
