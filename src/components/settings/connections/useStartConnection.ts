import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { toastError } from "@/components/utils/errorUtils";

/**
 * Démarre un consentement OAuth et suit l'URL rendue par le backend.
 *
 * Partagé entre le bouton « Connect » du catalogue et le « Reconnect » d'une
 * connexion cassée : reconnecter n'est pas une opération distincte, c'est le
 * même consentement — le retour retombera sur la même ligne par son
 * `externalAccountId`.
 */
export function useStartConnection() {
  const startOAuth = useMutation(api.connections.startOAuth);
  const [startingProvider, setStartingProvider] = useState<string | null>(null);

  const start = useCallback(
    async (providerId: string, providerLabel: string) => {
      setStartingProvider(providerId);
      try {
        // L'origine part d'ici : deux domaines servent la même app, et le
        // consentement doit rendre la main sur celui d'où l'on est parti.
        const { url } = await startOAuth({
          provider: providerId,
          returnOrigin: window.location.origin,
        });
        window.location.href = url;
      } catch (err) {
        toastError(err, `Could not start the ${providerLabel} connection`);
        setStartingProvider(null);
      }
    },
    [startOAuth],
  );

  return { start, startingProvider };
}
