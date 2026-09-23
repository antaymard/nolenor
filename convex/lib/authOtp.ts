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
 * par adresse (avec recharge continue), soit ~12 essais au plus pendant les
 * 15 minutes de validité d'un code (cf. `AUTH_OTP_MAX_AGE_MINUTES`). Sur 10⁴
 * combinaisons, c'est ~0,1 % de chances de tomber juste ; sur 10⁶, ~0,001 %.
 */
export const AUTH_OTP_LENGTH = 6;

/**
 * Durée de validité d'un code OTP, en minutes.
 *
 * Sans elle, les providers héritent du `maxAge` par défaut du provider Resend
 * d'Auth.js : 24 h. C'est bien plus que le temps d'aller lire un email, et
 * chaque heure de validité en plus rouvre 10 essais de devinette. 15 minutes
 * laissent le temps d'un email qui arrive en retard ou tombe en spam ; au-delà,
 * « renvoyer un code » coûte moins qu'un code qui traîne.
 *
 * En minutes parce que c'est aussi ce qu'on affiche dans l'email : le chiffre
 * annoncé à l'utilisateur ne peut pas diverger de la durée réelle.
 */
export const AUTH_OTP_MAX_AGE_MINUTES = 15;

/** La même durée en secondes, l'unité qu'attend `maxAge` côté provider. */
export const AUTH_OTP_MAX_AGE_S = AUTH_OTP_MAX_AGE_MINUTES * 60;
