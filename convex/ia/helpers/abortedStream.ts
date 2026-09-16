/**
 * Une coupure demandée n'est pas un échec.
 *
 * Quand `components.agent.streams.abortByOrder` passe, le `streamText` en cours
 * lève — par le même chemin qu'une vraie panne. Sans cette reconnaissance, une
 * interruption volontaire s'affiche en rouge et propose de réessayer.
 *
 * Reconnaissance par le message, faute de type d'erreur dédié côté composant
 * agent. Partagé entre le tour de Nolë et celui d'un sous-agent : les deux
 * peuvent être coupés par le même geste de l'utilisateur, et deux copies de ce
 * test divergeraient au premier changement de libellé en amont.
 */
export function isExpectedAbortedStreamError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("stream") &&
    message.includes("aborted") &&
    (message.includes("trying to finish") || message.includes("finish"))
  );
}
