import type { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "better-auth";
import { DEFAULT_USER_ROLE } from "@/lib/auth/roles";
import { formatPersonName } from "@/lib/text/names";
import { buildPasswordResetEmail, createMailer, type Mailer } from "@/lib/email/mailer";

type AuthEnv = Partial<Record<"NODE_ENV" | "PORT" | "BETTER_AUTH_TRUSTED_ORIGINS" | "RESEND_API_KEY" | "EMAIL_FROM", string>>;

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

export function buildAuthOptions(
  database: DatabaseSync,
  env: AuthEnv = process.env,
  mailer: Mailer = createMailer(env),
): BetterAuthOptions {
  return {
    database,
    trustedOrigins: resolveTrustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      // "Esqueci minha senha": link por e-mail, válido por 1 hora; ao redefinir, sai de todos os aparelhos.
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        try {
          await mailer.send(buildPasswordResetEmail(user, url));
        } catch (error) {
          // A resposta ao visitante é sempre a mesma (não revela se a conta existe); a falha fica no log.
          console.error("[e-mail] falha ao enviar o link de redefinição de senha", error);
        }
      },
    },
    // Nome do cliente sempre formatado ao criar/editar a conta ("Ana Maria da Silva").
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: { ...user, name: formatPersonName(user.name ?? "") || user.name } }) },
        update: { before: async (user) => (typeof user.name === "string" ? { data: { ...user, name: formatPersonName(user.name) || user.name } } : undefined) },
      },
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
