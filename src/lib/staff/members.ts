import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { STAFF_ROLES, type StaffRole } from "@/lib/staff/constants";

/** Quanto tempo o link de convite (criar a senha) vale. */
export const STAFF_INVITE_HOURS = 48;

/** Mesmas tabelas que o Better Auth usa, mas num banco só da equipe. */
export function migrateStaffDatabase(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS "user" ("id" text not null primary key, "name" text not null, "email" text not null unique,
      "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "role" text not null);
    CREATE TABLE IF NOT EXISTS "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique,
      "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text,
      "userId" text not null references "user" ("id") on delete cascade);
    CREATE TABLE IF NOT EXISTS "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null,
      "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text,
      "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text,
      "createdAt" date not null, "updatedAt" date not null);
    CREATE TABLE IF NOT EXISTS "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null,
      "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
  `);
}

export type StaffMember = { name: string; email: string; role: StaffRole; hasPassword: boolean };

export function listStaffMembers(database: DatabaseSync): StaffMember[] {
  migrateStaffDatabase(database);
  const rows = database.prepare(`
    SELECT u.name, u.email, u.role, EXISTS(SELECT 1 FROM account a WHERE a.userId = u.id AND a.password IS NOT NULL) AS hasPassword
    FROM user u ORDER BY u.name
  `).all() as Array<{ name: string; email: string; role: StaffRole; hasPassword: number }>;
  return rows.map((row) => ({ ...row, hasPassword: Boolean(row.hasPassword) }));
}

export type StaffInvite = { created: boolean; token: string; expiresAt: Date };

/**
 * Convida (ou reconvida) alguém da equipe. Gera um link de uso único para a pessoa criar a própria
 * senha — usa o mesmo mecanismo do "redefinir senha" do Better Auth (identifier reset-password:<token>).
 */
export function inviteStaffMember(
  database: DatabaseSync,
  input: { name: string; email: string; role: StaffRole },
  now = new Date(),
): StaffInvite {
  migrateStaffDatabase(database);
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new Error("Informe o nome da pessoa.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
  if (!(STAFF_ROLES as readonly string[]).includes(input.role)) throw new Error(`Papel inválido: use ${STAFF_ROLES.join(" ou ")}.`);

  const stamp = now.toISOString();
  const existing = database.prepare("SELECT id FROM user WHERE email = ?").get(email) as { id: string } | undefined;
  const userId = existing?.id ?? randomUUID();
  if (existing) {
    database.prepare("UPDATE user SET name = ?, role = ?, updatedAt = ? WHERE id = ?").run(name, input.role, stamp, userId);
  } else {
    database.prepare("INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, role) VALUES (?, ?, ?, 1, NULL, ?, ?, ?)")
      .run(userId, name, email, stamp, stamp, input.role);
  }

  // Um convite válido por pessoa: os anteriores deixam de funcionar.
  database.prepare("DELETE FROM verification WHERE identifier LIKE 'reset-password:%' AND value = ?").run(userId);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + STAFF_INVITE_HOURS * 3600_000);
  database.prepare("INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), `reset-password:${token}`, userId, expiresAt.toISOString(), stamp, stamp);

  return { created: !existing, token, expiresAt };
}

/** Tira o acesso: apaga a pessoa, as sessões abertas (cascade) e os convites. */
export function removeStaffMember(database: DatabaseSync, email: string): boolean {
  migrateStaffDatabase(database);
  database.exec("PRAGMA foreign_keys = ON");
  const user = database.prepare("SELECT id FROM user WHERE email = ?").get(email.trim().toLowerCase()) as { id: string } | undefined;
  if (!user) return false;
  database.prepare("DELETE FROM verification WHERE value = ?").run(user.id);
  database.prepare("DELETE FROM session WHERE userId = ?").run(user.id);
  database.prepare("DELETE FROM account WHERE userId = ?").run(user.id);
  database.prepare("DELETE FROM user WHERE id = ?").run(user.id);
  return true;
}

/** O convite ainda vale? (existe, não foi usado e não venceu) — para a página já avisar ao abrir. */
export function isStaffInviteValid(database: DatabaseSync, token: string, now = new Date()): boolean {
  migrateStaffDatabase(database);
  const row = database.prepare("SELECT expiresAt FROM verification WHERE identifier = ?").get(`reset-password:${token}`) as
    | { expiresAt: string }
    | undefined;
  return Boolean(row && new Date(row.expiresAt) > now);
}
