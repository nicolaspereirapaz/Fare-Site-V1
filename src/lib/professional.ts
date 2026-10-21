import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/*
 * Clientes profissionais: quem cria conta (ou entra) pelo link de convite da equipe paga a tabela de
 * Revelação Profissional nas fotos (PRO_PRICES em catalog.ts). Convite vale uma vez só, por 30 dias.
 * A equipe também pode marcar/desmarcar à mão na página do cliente.
 */
const INVITE_DAYS = 30;

function ensure(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fare_professional_invites (
      token TEXT PRIMARY KEY, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      used_by TEXT, used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS fare_professional_customers (
      user_id TEXT PRIMARY KEY, since TEXT NOT NULL, origin TEXT NOT NULL
    );
  `);
}

export function createProfessionalInvite(db: DatabaseSync, createdBy: string, now = new Date()) {
  ensure(db);
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString();
  db.prepare("INSERT INTO fare_professional_invites (token, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, createdBy, now.toISOString(), expiresAt);
  return { token, expiresAt };
}

export type InviteState = "valido" | "usado" | "vencido" | "inexistente";

export function inviteState(db: DatabaseSync, token: string, now = new Date()): InviteState {
  ensure(db);
  const row = db.prepare("SELECT expires_at, used_by FROM fare_professional_invites WHERE token = ?").get(token.slice(0, 64)) as { expires_at: string; used_by: string | null } | undefined;
  if (!row) return "inexistente";
  if (row.used_by) return "usado";
  return Date.parse(row.expires_at) < now.getTime() ? "vencido" : "valido";
}

/** Usa o convite nesta conta. Repetir com a mesma conta não dá erro. */
export function redeemProfessionalInvite(db: DatabaseSync, token: string, userId: string, now = new Date()) {
  ensure(db);
  const row = db.prepare("SELECT expires_at, used_by FROM fare_professional_invites WHERE token = ?").get(token.slice(0, 64)) as { expires_at: string; used_by: string | null } | undefined;
  if (!row) throw new Error("Convite não encontrado. Peça um novo à Fare Foto.");
  if (row.used_by && row.used_by !== userId) throw new Error("Este convite já foi usado. Peça um novo à Fare Foto.");
  if (!row.used_by && Date.parse(row.expires_at) < now.getTime()) throw new Error("Este convite venceu. Peça um novo à Fare Foto.");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE fare_professional_invites SET used_by = ?, used_at = COALESCE(used_at, ?) WHERE token = ?").run(userId, now.toISOString(), token);
    db.prepare("INSERT INTO fare_professional_customers (user_id, since, origin) VALUES (?, ?, 'convite') ON CONFLICT(user_id) DO NOTHING").run(userId, now.toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function isProfessional(db: DatabaseSync, userId: string | null | undefined) {
  if (!userId) return false;
  ensure(db);
  return Boolean(db.prepare("SELECT 1 FROM fare_professional_customers WHERE user_id = ?").get(userId));
}

/** Equipe marca ou tira a tabela profissional de uma conta. */
export function setProfessional(db: DatabaseSync, userId: string, on: boolean, by: string, now = new Date()) {
  ensure(db);
  if (on) db.prepare("INSERT INTO fare_professional_customers (user_id, since, origin) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING").run(userId, now.toISOString(), `equipe:${by}`);
  else db.prepare("DELETE FROM fare_professional_customers WHERE user_id = ?").run(userId);
}
