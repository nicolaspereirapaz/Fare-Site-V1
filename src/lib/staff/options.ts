import type { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "better-auth";
import { resolveTrustedOrigins } from "@/lib/auth/options";

/**
 * Login da EQUIPE, separado do login dos clientes:
 * - banco próprio (data/equipe.sqlite), outro endereço (/api/equipe/auth) e outro cookie;
 * - ninguém se cadastra pelo site: o administrador convida pelo terminal (npm run equipe);
 * - senha mínima de 10 caracteres e sessão de 12 horas.
 */
import { STAFF_AUTH_BASE_PATH, STAFF_COOKIE_PREFIX } from "@/lib/staff/constants";

export { STAFF_AUTH_BASE_PATH, STAFF_COOKIE_PREFIX, STAFF_ROLES, type StaffRole } from "@/lib/staff/constants";

type StaffEnv = Partial<Record<"NODE_ENV" | "PORT" | "BETTER_AUTH_TRUSTED_ORIGINS", string>>;

export function buildStaffAuthOptions(database: DatabaseSync, env: StaffEnv = process.env): BetterAuthOptions {
  return {
    appName: "Fare Foto — Equipe",
    database,
    basePath: STAFF_AUTH_BASE_PATH,
    trustedOrigins: resolveTrustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      // O convite já nasce com o link (gerado pelo terminal); não há "esqueci a senha" automático aqui.
      sendResetPassword: async () => undefined,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
    advanced: {
      cookiePrefix: STAFF_COOKIE_PREFIX,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "vendedor", input: false },
      },
    },
  };
}
