/** Constantes da área da equipe sem dependências de servidor (podem ir para o navegador). */
export const STAFF_AUTH_BASE_PATH = "/api/equipe/auth";
export const STAFF_COOKIE_PREFIX = "fare-equipe";
export const STAFF_ROLES = ["vendedor", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
