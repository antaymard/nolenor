/**
 * Slugifie un titre de node pour en faire un nom de fichier téléchargeable.
 *
 * Partagé par les boutons "Download" des nodes (blocknote → .md, app → .jsx) :
 * même titre, même nom de fichier, quel que soit le type de node.
 *
 * Accents retirés, tout ce qui n'est pas alphanumérique replié en tirets, et
 * longueur bornée — un titre peut être arbitrairement long, et certains
 * systèmes de fichiers coupent à 255 octets.
 */
export function filenameSlug(title: string, fallback: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return slug || fallback;
}
