import type { DatabaseSync } from "node:sqlite";
import type { Product, SupplierId } from "@/lib/xbz";
import { asiaConfigured, fetchAsiaProducts } from "./asiaImport";
import { fetchSpotProducts, spotConfigured } from "./spot";

/**
 * Catálogo local dos fornecedores adicionais (Spot e Asia Import).
 * O cliente nunca dispara chamada ao fornecedor: a loja lê o SQLite local e a sincronização
 * roda em segundo plano, no máximo uma vez por intervalo (catálogo + estoque juntos).
 */
type ExtraSupplier = Exclude<SupplierId, "xbz">;

const SUPPLIERS: Record<ExtraSupplier, { configured: () => boolean; fetch: () => Promise<Product[]>; intervalMs: number }> = {
  spot: { configured: spotConfigured, fetch: fetchSpotProducts, intervalMs: 3 * 60 * 60 * 1000 },
  asia: { configured: asiaConfigured, fetch: fetchAsiaProducts, intervalMs: 2 * 60 * 60 * 1000 },
};

/** Depois de uma falha, espera antes de tentar de novo (não insiste no fornecedor fora do ar). */
const RETRY_AFTER_ERROR_MS = 30 * 60 * 1000;

const globalState = globalThis as typeof globalThis & { supplierSyncs?: Map<ExtraSupplier, Promise<void>> };

export function migrateSupplierTables(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS supplier_catalog_products (
      supplier TEXT NOT NULL,
      id TEXT NOT NULL,
      product_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (supplier, id)
    );
    CREATE TABLE IF NOT EXISTS supplier_sync_state (
      supplier TEXT PRIMARY KEY,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      product_count INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function replaceSupplierCatalog(database: DatabaseSync, supplier: ExtraSupplier, products: Product[], now: string) {
  migrateSupplierTables(database);
  const insert = database.prepare("INSERT OR REPLACE INTO supplier_catalog_products (supplier, id, product_json, updated_at) VALUES (?, ?, ?, ?)");
  database.exec("BEGIN IMMEDIATE");
  try {
    // Snapshot completo: produto que saiu do fornecedor sai da loja.
    database.prepare("DELETE FROM supplier_catalog_products WHERE supplier = ?").run(supplier);
    for (const product of products) insert.run(supplier, product.id, JSON.stringify(product), now);
    database.prepare(`INSERT INTO supplier_sync_state (supplier, last_attempt_at, last_success_at, last_error, product_count)
      VALUES (?, ?, ?, NULL, ?) ON CONFLICT(supplier) DO UPDATE SET last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at, last_error = NULL, product_count = excluded.product_count`)
      .run(supplier, now, now, products.length);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function readSupplierProducts(database: DatabaseSync): Product[] {
  migrateSupplierTables(database);
  const rows = database.prepare("SELECT product_json FROM supplier_catalog_products ORDER BY supplier, rowid").all() as Array<{ product_json: string }>;
  return rows.map((row) => JSON.parse(row.product_json) as Product);
}

type SyncState = { last_attempt_at: string | null; last_success_at: string | null; last_error: string | null; product_count: number };

export function readSupplierSyncState(database: DatabaseSync, supplier: ExtraSupplier): SyncState | null {
  migrateSupplierTables(database);
  return (database.prepare("SELECT last_attempt_at, last_success_at, last_error, product_count FROM supplier_sync_state WHERE supplier = ?")
    .get(supplier) as SyncState | undefined) ?? null;
}

export function supplierSyncDue(state: SyncState | null, intervalMs: number, now: Date) {
  if (!state?.last_attempt_at) return true;
  const sinceAttempt = now.getTime() - new Date(state.last_attempt_at).getTime();
  return sinceAttempt >= (state.last_error ? RETRY_AFTER_ERROR_MS : intervalMs);
}

export async function syncSupplier(database: DatabaseSync, supplier: ExtraSupplier, now = new Date()) {
  const config = SUPPLIERS[supplier];
  migrateSupplierTables(database);
  database.prepare(`INSERT INTO supplier_sync_state (supplier, last_attempt_at) VALUES (?, ?)
    ON CONFLICT(supplier) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`).run(supplier, now.toISOString());
  try {
    const products = await config.fetch();
    if (!products.length) throw new Error("o fornecedor devolveu o catálogo vazio");
    replaceSupplierCatalog(database, supplier, products, new Date().toISOString());
    return products.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    database.prepare("UPDATE supplier_sync_state SET last_error = ? WHERE supplier = ?").run(message, supplier);
    throw error;
  }
}

/** Dispara (sem esperar) as sincronizações vencidas; uma por fornecedor de cada vez. */
export function refreshSuppliersInBackground(database: DatabaseSync, now = new Date()) {
  globalState.supplierSyncs ??= new Map();
  for (const supplier of Object.keys(SUPPLIERS) as ExtraSupplier[]) {
    const config = SUPPLIERS[supplier];
    if (!config.configured() || globalState.supplierSyncs.has(supplier)) continue;
    if (!supplierSyncDue(readSupplierSyncState(database, supplier), config.intervalMs, now)) continue;
    const run = syncSupplier(database, supplier, now)
      .then(() => undefined, (error) => console.error(`[fornecedores] ${supplier}:`, error instanceof Error ? error.message : error))
      .finally(() => globalState.supplierSyncs?.delete(supplier));
    globalState.supplierSyncs.set(supplier, run);
  }
}

export const EXTRA_SUPPLIERS = Object.keys(SUPPLIERS) as ExtraSupplier[];
