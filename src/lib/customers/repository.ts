import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { formatCnpj, formatCpf, formatPhoneBR, isBrazilianPhone, isValidCnpj, isValidCpf } from "@/lib/account/documents";
import { getCustomerProfile, saveCustomerProfile } from "@/lib/account/profileRepository";
import { formatDeliveryAddress, parseDeliveryAddress, type DeliveryAddress } from "@/lib/customers/address";

/**
 * Clientes para o orçamento do painel: contas do site (tabela `user` + cadastro) e clientes
 * cadastrados pelo vendedor (sem login). Nunca duplica: WhatsApp, e-mail e CPF/CNPJ são
 * comparados já normalizados contra os dois cadastros antes de criar um cliente novo.
 * Quando o cliente do painel cria conta no site com o mesmo e-mail, a conta "assume" os
 * orçamentos dele (aparecem em "Minha conta") e ele deixa de aparecer em separado na busca.
 */

export type CustomerKind = "conta" | "painel";

export type CustomerSummary = {
  ref: string;
  kind: CustomerKind;
  name: string;
  company: string;
  phone: string;
  email: string;
  document: string;
  createdBy?: string;
  /** Conta com a tabela profissional (cadastro pelo convite). */
  professional?: boolean;
  /** Endereço de entrega (só em resolveCustomer). */
  address?: DeliveryAddress;
  /** Outros cadastros com o mesmo WhatsApp ou CPF/CNPJ (o site não bloqueia; a equipe é avisada). */
  alsoUsedBy?: Array<{ name: string; by: Array<"WhatsApp" | "CPF/CNPJ"> }>;
};

export type DuplicateMatch = CustomerSummary & { by: Array<"WhatsApp" | "e-mail" | "CPF/CNPJ"> };

export class DuplicateCustomerError extends Error {
  constructor(public readonly matches: DuplicateMatch[]) {
    super("Este cliente já está cadastrado.");
    this.name = "DuplicateCustomerError";
  }
}

export type PanelCustomerInput = { name: string; company?: string; phone: string; email?: string; document?: string; address?: unknown };

/** Endereço de entrega digitado pela equipe, de qualquer cliente (chave = ref "painel:…" ou "conta:…"). */
function migrateAddresses(database: DatabaseSync) {
  database.exec("CREATE TABLE IF NOT EXISTS fare_customer_addresses (ref TEXT PRIMARY KEY, address TEXT NOT NULL)");
}
function readAddress(database: DatabaseSync, ref: string): DeliveryAddress | null {
  migrateAddresses(database);
  const row = database.prepare("SELECT address FROM fare_customer_addresses WHERE ref = ?").get(ref) as { address: string } | undefined;
  if (!row) return null;
  try {
    return parseDeliveryAddress(JSON.parse(row.address));
  } catch {
    return null;
  }
}
function saveAddress(database: DatabaseSync, ref: string, address: DeliveryAddress | null) {
  migrateAddresses(database);
  if (address) database.prepare("INSERT INTO fare_customer_addresses (ref, address) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET address = excluded.address").run(ref, JSON.stringify(address));
  else database.prepare("DELETE FROM fare_customer_addresses WHERE ref = ?").run(ref);
}

export const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizeDocument = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, "");
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_panel_customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      phone_norm TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL DEFAULT '',
      email_norm TEXT NOT NULL DEFAULT '',
      document TEXT NOT NULL DEFAULT '',
      document_norm TEXT NOT NULL DEFAULT '',
      created_by_id TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fare_panel_customers_email ON fare_panel_customers (email_norm) WHERE email_norm <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS fare_panel_customers_document ON fare_panel_customers (document_norm) WHERE document_norm <> '';
  `);
}

type AccountRow = { id: string; name: string; email: string; verified: number; phone: string | null; document: string | null; company: string | null; professional?: number };
type PanelRow = {
  id: string; name: string; company: string; phone: string; phone_norm: string; email: string; email_norm: string;
  document: string; document_norm: string; created_by_name: string;
};

function hasTable(database: DatabaseSync, name: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function readAccounts(database: DatabaseSync): AccountRow[] {
  if (!hasTable(database, "user")) return [];
  const rows = readAccountRows(database);
  if (!hasTable(database, "fare_professional_customers")) return rows;
  const pros = new Set((database.prepare("SELECT user_id FROM fare_professional_customers").all() as Array<{ user_id: string }>).map((r) => r.user_id));
  return rows.map((row) => ({ ...row, professional: pros.has(row.id) ? 1 : 0 }));
}

function readAccountRows(database: DatabaseSync): AccountRow[] {
  if (!hasTable(database, "fare_customer_profiles")) {
    return database.prepare("SELECT id, name, email, emailVerified AS verified, NULL AS phone, NULL AS document, NULL AS company FROM user").all() as unknown as AccountRow[];
  }
  return database.prepare(`
    SELECT u.id, u.name, u.email, u.emailVerified AS verified, p.phone, p.document,
           COALESCE(NULLIF(p.company_name, ''), NULLIF(p.trade_name, ''), '') AS company
    FROM user u LEFT JOIN fare_customer_profiles p ON p.user_id = u.id
  `).all() as unknown as AccountRow[];
}

function readPanel(database: DatabaseSync): PanelRow[] {
  migrate(database);
  return database.prepare("SELECT * FROM fare_panel_customers").all() as unknown as PanelRow[];
}

const accountSummary = (row: AccountRow): CustomerSummary => ({
  ref: `conta:${row.id}`, kind: "conta", name: row.name, company: row.company ?? "", phone: row.phone ?? "", email: normalizeEmail(row.email), document: row.document ?? "",
  ...(row.professional ? { professional: true } : {}),
});
const panelSummary = (row: PanelRow): CustomerSummary => ({
  ref: `painel:${row.id}`, kind: "painel", name: row.name, company: row.company, phone: row.phone, email: row.email, document: row.document, createdBy: row.created_by_name,
});

/**
 * Clientes do painel que já têm conta no site com o mesmo e-mail CONFIRMADO (a conta passa a
 * representá-los). E-mail não confirmado não vincula: qualquer um poderia criar conta com o e-mail de outro.
 */
function linkedPanelIds(accounts: AccountRow[], panel: PanelRow[]) {
  const emails = new Set(accounts.filter((account) => Number(account.verified) === 1).map((account) => normalizeEmail(account.email)));
  return new Set(panel.filter((row) => row.email_norm && emails.has(row.email_norm)).map((row) => row.id));
}

function allCustomers(database: DatabaseSync) {
  const accounts = readAccounts(database);
  const panel = readPanel(database);
  const linked = linkedPanelIds(accounts, panel);
  return [
    ...accounts.map((row) => ({ summary: accountSummary(row), phone: normalizePhone(row.phone ?? ""), email: normalizeEmail(row.email), document: normalizeDocument(row.document ?? "") })),
    ...panel.filter((row) => !linked.has(row.id)).map((row) => ({ summary: panelSummary(row), phone: row.phone_norm, email: row.email_norm, document: row.document_norm })),
  ];
}

/** Busca (mínimo 1 letra): nome, empresa e e-mail sem acento; WhatsApp e CPF/CNPJ por dígitos. */
export function searchCustomers(database: DatabaseSync, query: string, limit = 8): CustomerSummary[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const digits = normalizeDocument(query);
  const numeric = /^[\d\s().+\-/]+$/.test(query.trim()) || /\d{3,}/.test(digits);

  const everyone = allCustomers(database);
  return everyone
    .filter(({ summary, phone, document }) => {
      const text = fold(`${summary.name} ${summary.company} ${summary.email}`);
      if (words.every((word) => text.includes(word))) return true;
      return numeric && digits.length >= 3 && (phone.includes(digits) || document.includes(digits));
    })
    .map((customer) => {
      const others = everyone
        .filter((other) => other.summary.ref !== customer.summary.ref)
        .map((other) => {
          const by: Array<"WhatsApp" | "CPF/CNPJ"> = [];
          if (customer.phone && other.phone === customer.phone) by.push("WhatsApp");
          if (customer.document && other.document === customer.document) by.push("CPF/CNPJ");
          return { name: other.summary.name, by };
        })
        .filter((other) => other.by.length);
      return others.length ? { ...customer.summary, alsoUsedBy: others } : customer.summary;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit);
}

/** Todos os cadastros que já usam este WhatsApp, e-mail ou CPF/CNPJ (escritos de qualquer jeito). */
export function findCustomerDuplicates(database: DatabaseSync, input: { phone?: string; email?: string; document?: string }): DuplicateMatch[] {
  const phone = normalizePhone(input.phone ?? "");
  const email = normalizeEmail(input.email ?? "");
  const document = normalizeDocument(input.document ?? "");
  const matches: DuplicateMatch[] = [];
  for (const customer of allCustomers(database)) {
    const by: DuplicateMatch["by"] = [];
    if (phone && customer.phone === phone) by.push("WhatsApp");
    if (email && customer.email === email) by.push("e-mail");
    if (document && customer.document === document) by.push("CPF/CNPJ");
    if (by.length) matches.push({ ...customer.summary, by });
  }
  return matches.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function validate(input: PanelCustomerInput) {
  const name = input.name?.trim() ?? "";
  if (name.length < 2) throw new Error("Informe o nome do cliente.");
  if (!isBrazilianPhone(input.phone ?? "")) throw new Error("WhatsApp inválido. Use DDD + número.");
  const email = normalizeEmail(input.email ?? "");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
  const document = normalizeDocument(input.document ?? "");
  if (document) {
    const valid = document.length === 11 ? isValidCpf(document) : document.length === 14 && isValidCnpj(document);
    if (!valid) throw new Error("CPF/CNPJ inválido.");
  }
  const phone = normalizePhone(input.phone);
  return {
    name: name.slice(0, 120),
    company: (input.company ?? "").trim().slice(0, 120),
    phone: formatPhoneBR(phone),
    phoneNorm: phone,
    email,
    document: !document ? "" : document.length === 11 ? formatCpf(document) : formatCnpj(document),
    documentNorm: document,
    address: parseDeliveryAddress(input.address),
  };
}

/** Cadastra o cliente pelo painel. Se WhatsApp, e-mail ou CPF/CNPJ já existirem, lança DuplicateCustomerError. */
export function createPanelCustomer(database: DatabaseSync, input: PanelCustomerInput, actor: { id: string; name: string }): CustomerSummary & { id: string } {
  const data = validate(input);
  migrate(database);
  database.exec("BEGIN IMMEDIATE");
  try {
    const duplicates = findCustomerDuplicates(database, { phone: data.phoneNorm, email: data.email, document: data.documentNorm });
    if (duplicates.length) throw new DuplicateCustomerError(duplicates);
    const id = randomUUID();
    database.prepare(`
      INSERT INTO fare_panel_customers (id, name, company, phone, phone_norm, email, email_norm, document, document_norm, created_by_id, created_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.company, data.phone, data.phoneNorm, data.email, data.email, data.document, data.documentNorm, actor.id, actor.name, new Date().toISOString());
    saveAddress(database, `painel:${id}`, data.address);
    database.exec("COMMIT");
    return { id, ref: `painel:${id}`, kind: "painel", name: data.name, company: data.company, phone: data.phone, email: data.email, document: data.document, createdBy: actor.name, ...(data.address ? { address: data.address } : {}) };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export type ResolvedCustomer = CustomerSummary & { ownerId: string };

/** Cliente escolhido no orçamento: dono do orçamento (`userId` da conta ou `painel:<id>`) e dados. */
export function resolveCustomer(database: DatabaseSync, ref: string): ResolvedCustomer | null {
  const found = findCustomer(database, ref);
  const address = found ? readAddress(database, found.ref) : "";
  return found && address ? { ...found, address } : found;
}

function findCustomer(database: DatabaseSync, ref: string): ResolvedCustomer | null {
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (!id || ref.indexOf(":") < 0) return null;
  if (kind === "conta") {
    const row = readAccounts(database).find((account) => account.id === id);
    return row ? { ...accountSummary(row), ownerId: row.id } : null;
  }
  if (kind === "painel") {
    const row = readPanel(database).find((customer) => customer.id === id);
    return row ? { ...panelSummary(row), ownerId: `painel:${row.id}` } : null;
  }
  return null;
}

/** Donos de orçamento que esta conta enxerga em "Minha conta": ela mesma + clientes do painel com o mesmo e-mail. */
export function accountQuoteOwners(database: DatabaseSync, userId: string): string[] {
  const account = readAccounts(database).find((row) => row.id === userId);
  if (!account || Number(account.verified) !== 1) return [userId];
  const email = normalizeEmail(account.email);
  const panel = readPanel(database).filter((row) => row.email_norm && row.email_norm === email);
  return [userId, ...panel.map((row) => `painel:${row.id}`)];
}

/**
 * Equipe corrige o cadastro do cliente (nome, empresa, WhatsApp, e-mail, CPF/CNPJ).
 * Conta do site: o e-mail é o login e não muda aqui. Orçamentos e pedidos em aberto desse cliente
 * passam a mostrar os dados novos. Mesmo WhatsApp/e-mail/CPF de outro cadastro: DuplicateCustomerError.
 */
export function updateCustomer(database: DatabaseSync, ref: string, input: PanelCustomerInput): CustomerSummary {
  const current = resolveCustomer(database, ref);
  if (!current) throw new Error("Cliente não encontrado.");
  const data = validate({ ...input, email: current.kind === "conta" ? current.email : input.email });
  migrate(database);
  database.exec("BEGIN IMMEDIATE");
  try {
    const duplicates = findCustomerDuplicates(database, { phone: data.phoneNorm, email: data.email, document: data.documentNorm })
      .filter((match) => match.ref !== ref);
    if (duplicates.length) throw new DuplicateCustomerError(duplicates);
    const now = new Date().toISOString();
    if (current.kind === "painel") {
      database.prepare(`UPDATE fare_panel_customers SET name = ?, company = ?, phone = ?, phone_norm = ?, email = ?, email_norm = ?, document = ?, document_norm = ?
        WHERE id = ?`).run(data.name, data.company, data.phone, data.phoneNorm, data.email, data.email, data.document, data.documentNorm, ref.slice("painel:".length));
    } else {
      database.prepare("UPDATE user SET name = ?, updatedAt = ? WHERE id = ?").run(data.name, now, current.ownerId);
      const profile = getCustomerProfile(database, current.ownerId);
      saveCustomerProfile(database, current.ownerId, { ...profile, phone: data.phone, document: data.document, companyName: data.company });
    }
    saveAddress(database, ref, data.address);
    // Documentos em aberto mostram os dados novos (pedido concluído/cancelado fica como foi).
    const patch = (json: string) => {
      const customer = JSON.parse(json) as Record<string, unknown>;
      delete customer.company;
      delete customer.address;
      return JSON.stringify({ ...customer, name: data.name, phone: data.phone, ...(data.company ? { company: data.company } : {}), ...(data.address ? { address: formatDeliveryAddress(data.address) } : {}) });
    };
    for (const [table, closed] of [["fare_quotes", "'virou_pedido', 'cancelado'"], ["fare_orders", "'concluido', 'cancelado'"]] as const) {
      if (!hasTable(database, table)) continue;
      const rows = database.prepare(`SELECT id, customer_snapshot FROM ${table} WHERE user_id = ? AND status NOT IN (${closed})`).all(current.ownerId) as Array<{ id: string; customer_snapshot: string }>;
      // Sem mexer em updated_at: quem estiver com o orçamento aberto continua podendo salvar.
      for (const row of rows) database.prepare(`UPDATE ${table} SET customer_snapshot = ? WHERE id = ?`).run(patch(row.customer_snapshot), row.id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return resolveCustomer(database, ref)!;
}

/** Todos os clientes (contas do site + painel), por nome; com busca, igual ao orçamento. */
export function listCustomers(database: DatabaseSync, query = "", limit = 300): CustomerSummary[] {
  if (query.trim()) return searchCustomers(database, query, limit);
  return allCustomers(database).map((customer) => customer.summary).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).slice(0, limit);
}

export type CustomerHistoryEntry = { kind: "quote" | "order"; id: string; status: string; totalCents: number | null; createdAt: string };

/** Orçamentos e pedidos do cliente (conta do site inclui os feitos no painel com o mesmo e-mail), mais novos primeiro. */
export function customerHistory(database: DatabaseSync, ref: string): CustomerHistoryEntry[] {
  const customer = resolveCustomer(database, ref);
  if (!customer) return [];
  const owners = customer.kind === "conta" ? accountQuoteOwners(database, customer.ownerId) : [customer.ownerId];
  const marks = owners.map(() => "?").join(", ");
  const entries: CustomerHistoryEntry[] = [];
  for (const [kind, table] of [["quote", "fare_quotes"], ["order", "fare_orders"]] as const) {
    if (!hasTable(database, table)) continue;
    const rows = database.prepare(`SELECT id, status, total_cents, created_at FROM ${table} WHERE user_id IN (${marks})`).all(...owners) as Array<{ id: string; status: string; total_cents: number | null; created_at: string }>;
    entries.push(...rows.map((row) => ({ kind, id: row.id, status: row.status, totalCents: row.total_cents, createdAt: row.created_at })));
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
