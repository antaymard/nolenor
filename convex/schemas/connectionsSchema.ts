import { v, type Infer } from "convex/values";

// Secret chiffré au repos (AES-GCM, cf. lib/secretCrypto). La charge utile
// sérialisée à l'intérieur dépend du provider — la table n'a pas à la
// connaître, et n'a donc rien à migrer quand un provider d'un autre type
// arrive.
const encryptedSecretValidator = v.object({
  keyVersion: v.number(),
  iv: v.string(),
  ciphertext: v.string(),
});

const connectionStatusValidator = v.union(
  v.literal("active"),
  // Le provider a refusé le credential (révocation, scope retiré, mot de passe
  // changé). Volontairement distinct d'une suppression : le node connecté doit
  // pouvoir afficher « reconnecter » plutôt que disparaître.
  v.literal("needs_reauth"),
);

const connectionsValidator = v.object({
  userId: v.id("users"),
  // Clé dans `config/providersConfig`, pas une union de schéma : le registre
  // est l'autorité, et un provider retiré du registre ne doit pas exiger un
  // push de schéma pour que la base reste valide.
  provider: v.string(),
  // Identité du compte CHEZ le provider (adresse Gmail, id GitHub). C'est elle
  // qui rend deux comptes Gmail du même utilisateur distinguables, et elle qui
  // sert de clé d'upsert au retour d'OAuth.
  externalAccountId: v.string(),
  // Ce qu'on montre à l'utilisateur : l'adresse ou le login.
  label: v.string(),
  scopes: v.array(v.string()),
  status: connectionStatusValidator,
  secret: encryptedSecretValidator,
  // Expiration de l'access token. Absent = ne périme pas (token GitHub d'OAuth
  // App classique).
  expiresAt: v.optional(v.number()),
  // Bail de refresh : horodatage jusqu'auquel un appelant détient le droit de
  // rafraîchir. Sans ce bail, dix nodes qui se réveillent ensemble déclenchent
  // dix refresh concurrents — et Google invalide les refresh tokens qu'il voit
  // rejouer. Cf. connectionModels.claimRefresh.
  refreshingUntil: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),
  // Dernier échec côté provider, pour que l'écran de settings puisse dire
  // pourquoi une connexion est en `needs_reauth`.
  lastError: v.optional(v.string()),
  updatedAt: v.number(),
});

type EncryptedSecret = Infer<typeof encryptedSecretValidator>;
type ConnectionStatus = Infer<typeof connectionStatusValidator>;

export {
  connectionsValidator,
  connectionStatusValidator,
  encryptedSecretValidator,
};
export type { ConnectionStatus, EncryptedSecret };
