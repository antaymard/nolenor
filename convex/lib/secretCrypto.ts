// ============================================================================
// CHIFFREMENT DES SECRETS DE CONNEXION
// ============================================================================
// Les credentials des comptes tiers (access token, refresh token, clé d'API)
// sont chiffrés au repos : une lecture de la table `connections` — dashboard,
// export, fuite d'un snapshot — ne doit rendre que de l'opaque.
//
// AES-GCM et pas AES-CBC : GCM authentifie le chiffré, donc un octet modifié
// en base fait échouer le déchiffrement au lieu de rendre un clair corrompu.
//
// Web Crypto pur, aucun import `node:` : le runtime V8 de Convex l'expose (il
// sert déjà `crypto.subtle.digest` dans `lib/apiTokenCrypto`), donc ce module
// reste utilisable depuis une mutation comme depuis une action.

/** Version de clé écrite avec chaque secret, pour permettre une rotation. */
const CURRENT_KEY_VERSION = 1;

/** 96 bits : la taille d'IV recommandée pour GCM. Aléatoire à chaque écriture. */
const IV_BYTES = 12;

const MASTER_KEY_BYTES = 32;

export type EncryptedSecret = {
  keyVersion: number;
  iv: string;
  ciphertext: string;
};

// ── Encodage ────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Clé maître ──────────────────────────────────────────────────────────

/**
 * Une variable d'environnement par version de clé. Faire tourner la clé, c'est
 * ajouter un cas ici, incrémenter `CURRENT_KEY_VERSION`, et laisser les
 * anciennes lignes se réécrire au fil des refresh : les deux versions restent
 * déchiffrables tant que les deux variables sont posées.
 *
 * Lectures STATIQUES (`process.env.X`) et non indexées : c'est la seule forme
 * que la documentation de Convex garantit sur le runtime des fonctions. Le prix
 * est une ligne par version de clé, ce qui reste moins cher qu'un déploiement
 * où les secrets sont introuvables sans qu'on sache pourquoi.
 */
function readMasterKeyEnv(version: number): { name: string; value?: string } {
  switch (version) {
    case 1:
      return {
        name: "CONNECTIONS_MASTER_KEY",
        value: process.env.CONNECTIONS_MASTER_KEY,
      };
    default:
      throw new Error(
        `Version de clé de chiffrement inconnue : ${version}. ` +
          "Une ligne chiffrée avec une clé retirée du code est illisible.",
      );
  }
}

// L'import d'une clé est une opération asynchrone qu'on ne veut pas refaire à
// chaque appel. Le cache vit dans l'isolate, jamais en base.
const keyCache = new Map<number, Promise<CryptoKey>>();

function loadMasterKey(version: number): Promise<CryptoKey> {
  const cached = keyCache.get(version);
  if (cached) return cached;

  const { name: envName, value: raw } = readMasterKeyEnv(version);
  if (!raw) {
    throw new Error(
      `${envName} n'est pas définie sur ce déploiement Convex. ` +
        "Générer une clé : `openssl rand -base64 32`, puis " +
        `\`npx convex env set ${envName} <clé>\`.`,
    );
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(raw.trim());
  } catch {
    throw new Error(`${envName} n'est pas du base64 valide.`);
  }
  if (bytes.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `${envName} doit faire ${MASTER_KEY_BYTES} octets une fois décodée ` +
        `(reçu ${bytes.length}). \`openssl rand -base64 32\`.`,
    );
  }

  const promise = crypto.subtle
    .importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    // Sans ceci, un import raté resterait en cache : l'isolate rejouerait
    // l'échec jusqu'à sa mort, même une fois la variable corrigée.
    .catch((error: unknown) => {
      keyCache.delete(version);
      throw error;
    });
  keyCache.set(version, promise);
  return promise;
}

// ── API ─────────────────────────────────────────────────────────────────

/**
 * Chiffre la charge utile d'une connexion. Elle est sérialisée en JSON : sa
 * forme dépend du provider (`{ accessToken, refreshToken }` en OAuth,
 * `{ apiKey }` pour un token personnel), et la table n'a pas à la connaître.
 */
export async function encryptSecret(
  payload: unknown,
): Promise<EncryptedSecret> {
  const key = await loadMasterKey(CURRENT_KEY_VERSION);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );

  return {
    keyVersion: CURRENT_KEY_VERSION,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Déchiffre une charge utile. À n'appeler que dans une action, juste avant
 * l'appel réseau qui en a besoin — jamais pour rendre quoi que ce soit au
 * client.
 */
export async function decryptSecret<T>(secret: EncryptedSecret): Promise<T> {
  const key = await loadMasterKey(secret.keyVersion);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(secret.iv) },
    key,
    fromBase64(secret.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

// ── Aléa d'usage général ────────────────────────────────────────────────

/** Chaîne aléatoire url-safe (nonce d'état OAuth, verifier PKCE). */
export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** SHA-256 hex — pour ne stocker qu'une empreinte du nonce d'état. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Challenge PKCE S256 : base64url du SHA-256 du verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return toBase64(new Uint8Array(digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
