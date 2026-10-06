/**
 * L'échelle typographique des titres du canvas, partagée par le node `title`
 * et le titre des frames : un h1 de frame et un h1 de titre ont la même
 * taille, et grossissent pareil avec l'option « Scale with zoom ».
 */
export const TITLE_HEADING_CLASSNAMES = {
  h1: "text-[28px] font-semibold",
  h2: "text-[22px] font-semibold",
  h3: "text-base font-semibold",
} as const;
