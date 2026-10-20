/** Acesso sem senha (só para testes locais). Nunca liga no servidor de produção, mesmo se a variável vier ligada por engano. */
export function temporaryAccessEnabled() {
  return process.env.FARE_TEMPORARY_PASSWORDLESS === "1" && process.env.NODE_ENV !== "production";
}

export const TEMPORARY_ADMIN = {
  user: {
    id: "temporary-open-admin",
    name: "Acesso temporário — sem autenticação",
    email: "temporary-admin@invalid",
    role: "admin" as const,
  },
};

export function resolveTemporaryStaff<T>(session: T | null): T | typeof TEMPORARY_ADMIN | null {
  return session ?? (temporaryAccessEnabled() ? TEMPORARY_ADMIN : null);
}
