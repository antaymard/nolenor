import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Logs in as the dedicated "eval bot" account (Password provider, see
// convex/auth.ts) rather than using an admin/deploy-key bypass, so that
// runEvalTurn stays a normal auth-gated action like everything else in the app.
export async function createEvalConvexClient(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(requiredEnv("CONVEX_URL"));

  const result = await client.action(api.auth.signIn, {
    provider: "password",
    params: {
      email: requiredEnv("EVAL_USER_EMAIL"),
      password: requiredEnv("EVAL_USER_PASSWORD"),
      flow: "signIn",
    },
  });

  if (!result.tokens) {
    throw new Error("Eval bot sign-in failed: no tokens returned.");
  }

  client.setAuth(result.tokens.token);
  return client;
}
