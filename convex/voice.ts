import { query } from "./_generated/server";
import { v } from "convex/values";
import { optionalAuth } from "./lib/auth";

/**
 * Renvoie la config de connexion au voice-server (URL + token) aux utilisateurs
 * authentifiés uniquement.
 *
 * Pourquoi passer par le backend ?
 * - Le token n'est PAS embarqué en dur dans le bundle front : il reste dans les
 *   variables d'env Convex (hors repo) et n'est servi qu'aux users connectés.
 * - Le flux audio temps réel, lui, ne passe PAS par Convex (une action HTTP est
 *   du request/response, pas du full-duplex). Le navigateur ouvre donc un
 *   WebSocket directement vers le voice-server.
 *
 * NB sécurité : le token finit quand même par atteindre le navigateur (le
 * voice-server n'a qu'un token partagé). La vraie barrière est l'allowlist
 * `ALLOWED_ORIGINS` côté voice-server (tes "domains") : mets-y le domaine de
 * l'app pour qu'aucune autre origine ne puisse ouvrir de session.
 *
 * Config requise (déploiement Convex) :
 *   npx convex env set VOICE_SERVER_URL   https://voice.exemple.com
 *   npx convex env set VOICE_SERVER_TOKEN <AUTH_TOKEN du voice-server>
 */
export const realtimeConfig = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      url: v.string(),
      token: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await optionalAuth(ctx);
    if (!userId) return null;

    const url = process.env.VOICE_SERVER_URL;
    const token = process.env.VOICE_SERVER_TOKEN;
    if (!url || !token) return null;

    return { url, token };
  },
});
