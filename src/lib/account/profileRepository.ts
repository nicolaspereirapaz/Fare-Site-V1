import type { DatabaseSync } from "node:sqlite";
import { EMPTY_PROFILE, toStoredProfile, type PersonType, type StoredProfile } from "@/lib/account/profile";

/**
 * Cadastro do cliente (PF/PJ, documento, telefone, endereço). Tabela da loja, separada das
 * tabelas do login; criada e atualizada sozinha no primeiro acesso, como a de pedidos.
 */
const COLUMNS = {
  person_type: "TEXT NOT NULL DEFAULT 'pf'",
  document: "TEXT NOT NULL DEFAULT ''",
  company_name: "TEXT NOT NULL DEFAULT ''",
  trade_name: "TEXT NOT NULL DEFAULT ''",
  state_registration: "TEXT NOT NULL DEFAULT ''",
  phone: "TEXT NOT NULL DEFAULT ''",
  cep: "TEXT NOT NULL DEFAULT ''",
  street: "TEXT NOT NULL DEFAULT ''",
  number: "TEXT NOT NULL DEFAULT ''",
  complement: "TEXT NOT NULL DEFAULT ''",
  district: "TEXT NOT NULL DEFAULT ''",
  city: "TEXT NOT NULL DEFAULT ''",
  state: "TEXT NOT NULL DEFAULT ''",
} as const;

type Row = Record<keyof typeof COLUMNS, string> & { company?: string };

function runProfileMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_customer_profiles (
      user_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    )
  `);
  const existing = new Set(
    (database.prepare("PRAGMA table_info(fare_customer_profiles)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  for (const [column, definition] of Object.entries(COLUMNS)) {
    if (!existing.has(column)) database.exec(`ALTER TABLE fare_customer_profiles ADD COLUMN ${column} ${definition}`);
  }
  // Versão anterior guardava só "company": vira a razão social.
  if (existing.has("company")) {
    database.exec("UPDATE fare_customer_profiles SET company_name = company WHERE company_name = '' AND company <> ''");
  }
}

export function getCustomerProfile(database: DatabaseSync, userId: string): StoredProfile {
  runProfileMigrations(database);
  const row = database.prepare("SELECT * FROM fare_customer_profiles WHERE user_id = ?").get(userId) as Row | undefined;
  if (!row) return toStoredProfile(EMPTY_PROFILE);
  return {
    personType: (row.person_type === "pj" ? "pj" : "pf") as PersonType,
    document: row.document,
    companyName: row.company_name,
    tradeName: row.trade_name,
    stateRegistration: row.state_registration,
    phone: row.phone,
    address: {
      cep: row.cep,
      street: row.street,
      number: row.number,
      complement: row.complement,
      district: row.district,
      city: row.city,
      state: row.state,
    },
  };
}

export function saveCustomerProfile(database: DatabaseSync, userId: string, profile: StoredProfile) {
  runProfileMigrations(database);
  const values: Record<keyof typeof COLUMNS, string> = {
    person_type: profile.personType,
    document: profile.document,
    company_name: profile.companyName,
    trade_name: profile.tradeName,
    state_registration: profile.stateRegistration,
    phone: profile.phone,
    cep: profile.address.cep,
    street: profile.address.street,
    number: profile.address.number,
    complement: profile.address.complement,
    district: profile.address.district,
    city: profile.address.city,
    state: profile.address.state,
  };
  const columns = Object.keys(values);
  database.prepare(`
    INSERT INTO fare_customer_profiles (user_id, updated_at, ${columns.join(", ")})
    VALUES (?, ?, ${columns.map(() => "?").join(", ")})
    ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at,
      ${columns.map((column) => `${column} = excluded.${column}`).join(", ")}
  `).run(userId, new Date().toISOString(), ...Object.values(values));
}
