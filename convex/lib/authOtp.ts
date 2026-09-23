/**
 * Longueur des codes OTP d'authentification (vérification d'email et
 * réinitialisation de mot de passe).
 *
 * Isolée dans un fichier sans dépendance parce que le front l'importe aussi :
 * l'écran de saisie dessine une case par chiffre et soumet tout seul quand la
 * dernière est remplie. Un décalage entre les deux côtés ferait soit partir un
 * code tronqué, soit ne jamais déclencher la soumission.
 *
 * 6 plutôt que 4 : @convex-dev/auth limite les essais ratés à 10 par heure et
 * par adresse, et un code reste valide 24 h (le `maxAge` par défaut du
 * provider Resend d'Auth.js), soit ~240 essais sur la durée de vie d'un code.
 * Sur 10⁴ combinaisons, c'est 2,4 % de chances de tomber juste ; sur 10⁶,
 * 0,024 %.
 */
export const AUTH_OTP_LENGTH = 6;
