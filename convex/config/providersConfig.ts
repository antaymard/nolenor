// ============================================================================
// REGISTRE DES PROVIDERS
// ============================================================================
// Source de vérité unique d'un service tiers, sur le modèle de `nodeConfig.ts`
// (types de nodes) et de `ia/tools/index.ts` (tools de l'agent) : une entrée
// déclarative, lue par toutes les surfaces plutôt que réimplémentée dans
// chacune.
//
// Aujourd'hui la lisent : le flux OAuth (`connections.ts`, `http.ts`), le
// client d'appel (`lib/providerClient.ts`) et l'écran de settings. Viendront
// s'y brancher, sans changer la forme : la résolution d'URL collée, la
// recherche fédérée de l'omnibarre, la normalisation des objets distants, les
// actions sortantes et le routage des webhooks (cf. SPECS/connected-nodes.md).
//
// Ajouter un provider = ajouter une entrée ici + poser ses deux variables
// d'environnement. Rien d'autre n'a à bouger tant qu'aucun node n'est en jeu.

export type ProviderId = "google" | "github";

type OAuthConfig = {
  type: "oauth2";
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Paramètres supplémentaires de l'URL d'autorisation. */
  authorizeParams?: Record<string, string>;
  /**
   * PKCE : redondant avec un client confidentiel (on a un client_secret), mais
   * gratuit là où le provider le supporte, et il ferme l'interception du code
   * d'autorisation. GitHub (OAuth App) ne le supporte pas.
   */
  usePkce: boolean;
  /**
   * Lecture des identifiants OAuth. Une fonction par provider, avec des accès
   * `process.env.X` STATIQUES : c'est la seule forme garantie sur le runtime
   * Convex, et un `process.env[nom]` calculé rendrait `undefined` partout —
   * c'est-à-dire un provider éternellement « non configuré », sans erreur.
   */
  readCredentials: () => ProviderCredentials | null;
  /** Noms affichés dans les settings quand il manque quelque chose. */
  envNames: [string, string];
  /** Certains fournisseurs de tokens rendent du form-urlencoded sans ce header. */
  tokenAcceptJson?: boolean;
};

type IdentityProbe = {
  /**
   * Appel de contrôle. Il doit faire deux choses d'un coup : prouver que le
   * credential est vivant, et nommer le compte — sans quoi deux connexions
   * Gmail seraient indiscernables dans la liste.
   */
  url: string;
  parse: (json: unknown) => { externalAccountId: string; label: string };
  /** Résumé affiché après un test manuel. */
  summarize?: (json: unknown) => string;
};

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  description: string;
  /** Nom d'icône react-icons, résolu côté front (pas de composant en config). */
  icon: string;
  auth: OAuthConfig;
  /**
   * Allowlist SSRF du broker : les seuls hôtes qu'un appel crédité peut viser
   * pour ce provider. Les endpoints d'auth n'y figurent volontairement pas —
   * un appel proxifié n'a aucune raison d'aller parler au serveur de tokens.
   */
  apiHosts: string[];
  identity: IdentityProbe;
};

export type ProviderCredentials = { clientId: string; clientSecret: string };

function pair(
  clientId: string | undefined,
  clientSecret: string | undefined,
): ProviderCredentials | null {
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function readString(json: unknown, key: string): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

const providers: Record<ProviderId, ProviderConfig> = {
  google: {
    id: "google",
    label: "Google",
    description: "Gmail — read threads and messages.",
    icon: "TbBrandGoogle",
    auth: {
      type: "oauth2",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      // Périmètre du socle : lecture seule. `gmail.compose` arrivera avec les
      // drafts, par consentement incrémental (`include_granted_scopes`), sans
      // invalider les connexions déjà accordées.
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      authorizeParams: {
        // Sans `access_type=offline`, Google ne rend aucun refresh token et la
        // connexion meurt au bout d'une heure. Et sans `prompt=consent`, il
        // n'en rend qu'au tout premier consentement : un utilisateur qui
        // reconnecte son compte repartirait sans refresh token, donc avec une
        // connexion condamnée. C'est le piège numéro un de l'OAuth Google.
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
      usePkce: true,
      envNames: [
        "GOOGLE_INTEGRATION_CLIENT_ID",
        "GOOGLE_INTEGRATION_CLIENT_SECRET",
      ],
      readCredentials: () =>
        pair(
          process.env.GOOGLE_INTEGRATION_CLIENT_ID,
          process.env.GOOGLE_INTEGRATION_CLIENT_SECRET,
        ),
    },
    apiHosts: ["gmail.googleapis.com", "www.googleapis.com"],
    identity: {
      // Un seul appel qui prouve le scope Gmail ET nomme le compte.
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      parse: (json) => {
        const email = readString(json, "emailAddress");
        if (!email) {
          throw new Error("Unexpected Gmail response: no emailAddress.");
        }
        return { externalAccountId: email, label: email };
      },
      summarize: (json) => {
        const email = readString(json, "emailAddress") ?? "unknown account";
        const total =
          typeof json === "object" && json !== null
            ? (json as Record<string, unknown>).messagesTotal
            : undefined;
        return typeof total === "number"
          ? `${email} — ${total} messages`
          : email;
      },
    },
  },

  github: {
    id: "github",
    label: "GitHub",
    description: "Pull requests, issues and repositories.",
    icon: "TbBrandGithub",
    auth: {
      type: "oauth2",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user"],
      usePkce: false,
      tokenAcceptJson: true,
      envNames: [
        "GITHUB_INTEGRATION_CLIENT_ID",
        "GITHUB_INTEGRATION_CLIENT_SECRET",
      ],
      readCredentials: () =>
        pair(
          process.env.GITHUB_INTEGRATION_CLIENT_ID,
          process.env.GITHUB_INTEGRATION_CLIENT_SECRET,
        ),
    },
    apiHosts: ["api.github.com"],
    identity: {
      url: "https://api.github.com/user",
      parse: (json) => {
        const login = readString(json, "login");
        const id =
          typeof json === "object" && json !== null
            ? (json as Record<string, unknown>).id
            : undefined;
        if (!login) {
          throw new Error("Unexpected GitHub response: no login.");
        }
        return {
          externalAccountId: typeof id === "number" ? String(id) : login,
          label: login,
        };
      },
      summarize: (json) => readString(json, "login") ?? "unknown account",
    },
  },
};

export const providerIds = Object.keys(providers) as ProviderId[];

export function isProviderId(value: string): value is ProviderId {
  return value in providers;
}

export function getProvider(id: ProviderId): ProviderConfig {
  return providers[id];
}

/**
 * Un provider dont les variables d'environnement sont absentes est *déclaré*
 * mais pas *configuré* : il apparaît grisé dans les settings au lieu de rendre
 * une erreur au clic. C'est ce qui permet de livrer GitHub dans le registre
 * sans avoir à créer l'app OAuth le même jour.
 */
export function readProviderCredentials(
  provider: ProviderConfig,
): ProviderCredentials | null {
  return provider.auth.readCredentials();
}

export function isProviderConfigured(provider: ProviderConfig): boolean {
  return readProviderCredentials(provider) !== null;
}

/**
 * URL de callback à déclarer chez le provider. Elle est la même pour tous :
 * c'est l'état d'OAuth qui porte le provider, pas le chemin — une route de
 * moins à router, et un champ de moins à recopier dans chaque console.
 *
 * `CONVEX_SITE_URL` est le domaine `.convex.site` du déploiement (celui qui
 * sert `http.ts`), déjà utilisé par `auth.config.ts`.
 */
export function oauthCallbackUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL est absente du déploiement Convex.");
  }
  return `${siteUrl.replace(/\/$/, "")}/integrations/oauth/callback`;
}

/** Un hôte est-il joignable par le broker pour ce provider ? */
export function isAllowedApiHost(
  provider: ProviderConfig,
  hostname: string,
): boolean {
  return provider.apiHosts.includes(hostname.toLowerCase());
}
