import type { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "better-auth";
import { DEFAULT_USER_ROLE } from "@/lib/auth/roles";

type AuthEnv = Partial<Record<"NODE_ENV" | "PORT" | "BETTER_AUTH_TRUSTED_ORIGINS", string>>;

/**
 * Origens de onde o navegador pode chamar /api/auth (proteção CSRF do Better Auth).
 * - Desenvolvimento: localhost, 127.0.0.1 e a rede local (192.168.x.x) na porta do dev.
 * - Produção: só o que estiver em BETTER_AUTH_TRUSTED_ORIGINS (ex.: https://www.farefoto.com.br),
 *   além do BETTER_AUTH_URL, que o Better Auth já confia sozinho.
 */
export function resolveTrustedOrigins(env: AuthEnv = process.env): string[] {
  const extra = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (env.NODE_ENV === "production") return extra;

  const port = env.PORT?.trim() || "3000";
  return [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://192.168.*.*:${port}`,
    ...extra,
  ];
}

export function buildAuthOptions(database: DatabaseSync, env: AuthEnv = process.env): BetterAuthOptions {
  return {
    database,
    trustedOrigins: resolveTrustedOrigins(env),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: DEFAULT_USER_ROLE,
          input: false,
        },
      },
    },
  };
}
