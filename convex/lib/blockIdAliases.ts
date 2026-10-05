// Alias courts des ids de blocs BlockNote, pour l'agent.
//
// L'éditeur donne à chaque bloc un uuid v4 (36 caractères) et ne permet pas
// d'en changer le générateur. Plutôt que de toucher au stockage, l'agent voit
// un alias au format llmId (`b_x123y456z`), dérivé de l'id réel par un hash :
// le même bloc a toujours le même alias, sans table de correspondance à
// stocker, et les documents existants en profitent sans migration.
//
// Les deux sens vivent ici : `aliasBlockIds` à la lecture (read_nodes), et
// `withBlockIdAliases` autour des éditions (editBlockNoteDocument), qui fait
// travailler l'opération dans l'espace des alias puis restaure les ids réels.
//
// Deux blocs d'un même document dont les alias entrent en collision (≈ n²/2,8·10¹¹)
// gardent leur id réel : l'alias n'est qu'un raccourci, jamais une ambiguïté.

import type { BlockNoteBlock, BlockNoteBlockWithOptionalId } from "./blockNoteDocument";
import { BLOCK_ID_ALIAS_PREFIX, llmIdFromSeed } from "./llmId";

export type BlockIdAliases = {
  /** id réel → id montré à l'agent (l'alias, ou l'id réel en cas de collision). */
  toAlias: ReadonlyMap<string, string>;
  /** alias → id réel, pour les seuls blocs qui en ont un. */
  toReal: ReadonlyMap<string, string>;
};

type WithChildren = { id?: string; children?: WithChildren[] };

/** cyrb53 : hash 53 bits synchrone, suffisant pour dériver un alias stable. */
function hash53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function blockIdAlias(realId: string): string {
  return `${BLOCK_ID_ALIAS_PREFIX}${llmIdFromSeed(hash53(realId))}`;
}

function collectIds(blocks: readonly WithChildren[], out: string[]): string[] {
  for (const b of blocks) {
    if (typeof b.id === "string" && b.id) out.push(b.id);
    if (Array.isArray(b.children)) collectIds(b.children, out);
  }
  return out;
}

export function buildBlockIdAliases(blocks: readonly BlockNoteBlock[]): BlockIdAliases {
  const realIds = collectIds(blocks, []);
  const realIdSet = new Set(realIds);

  const candidates = new Map<string, string>();
  const aliasCounts = new Map<string, number>();
  for (const id of realIds) {
    const alias = blockIdAlias(id);
    candidates.set(id, alias);
    aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1);
  }

  const toAlias = new Map<string, string>();
  const toReal = new Map<string, string>();
  for (const [id, alias] of candidates) {
    // Un alias partagé par deux blocs, ou égal à l'id réel d'un autre bloc,
    // désignerait deux blocs à la fois : ces blocs-là gardent leur id réel.
    if (aliasCounts.get(alias) === 1 && !realIdSet.has(alias)) {
      toAlias.set(id, alias);
      toReal.set(alias, id);
    } else {
      toAlias.set(id, id);
    }
  }
  return { toAlias, toReal };
}

/**
 * Traduit un id fourni par l'agent vers l'espace des alias. L'id réel est
 * accepté aussi : un fil de conversation antérieur à cette convention peut en
 * contenir. Un id inconnu passe tel quel, et l'opération le signalera.
 */
export function resolveBlockIdAlias(aliases: BlockIdAliases, id: string): string {
  return aliases.toAlias.get(id) ?? id;
}

function mapIds<T extends WithChildren>(blocks: readonly T[], map: (id: string) => string): T[] {
  return blocks.map((b) => {
    const out = { ...b };
    if (typeof b.id === "string" && b.id) out.id = map(b.id);
    if (Array.isArray(b.children)) out.children = mapIds(b.children, map);
    return out;
  });
}

/** Copie du document où chaque id est remplacé par celui que voit l'agent. */
export function aliasBlockIds(
  blocks: readonly BlockNoteBlock[],
  aliases: BlockIdAliases = buildBlockIdAliases(blocks),
): BlockNoteBlock[] {
  return mapIds(blocks, (id) => aliases.toAlias.get(id) ?? id);
}

/** Ids écrits par l'agent dans un bloc de remplacement, ramenés aux alias. */
export function resolveBlockIdsIn(
  block: BlockNoteBlockWithOptionalId,
  resolve: (id: string) => string,
): BlockNoteBlockWithOptionalId {
  return mapIds([block], resolve)[0];
}

/**
 * Applique une édition dans l'espace des alias : `edit` reçoit le document
 * aliasé et une fonction de résolution pour les ids fournis par l'agent, et
 * travaille comme si les alias étaient les vrais ids (messages d'erreur
 * compris, qui listent donc des alias). Les ids réels sont restaurés ensuite ;
 * ceux que l'édition a créés sont gardés tels quels.
 */
export function withBlockIdAliases<R extends { tree: BlockNoteBlock[] }>(
  blocks: readonly BlockNoteBlock[],
  edit: (aliased: BlockNoteBlock[], resolve: (id: string) => string) => R,
): R & { aliasOf: (realId: string) => string } {
  const aliases = buildBlockIdAliases(blocks);
  const result = edit(aliasBlockIds(blocks, aliases), (id) =>
    resolveBlockIdAlias(aliases, id),
  );
  const tree = mapIds(result.tree, (id) => aliases.toReal.get(id) ?? id);
  // L'alias d'un bloc créé par l'édition n'existe qu'une fois le document
  // final connu : c'est celui que la prochaine lecture montrera.
  const finalAliases = buildBlockIdAliases(tree);
  return {
    ...result,
    tree,
    aliasOf: (realId) => finalAliases.toAlias.get(realId) ?? realId,
  };
}
