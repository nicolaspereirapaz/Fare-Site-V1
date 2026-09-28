import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Product } from "@/lib/xbz";

export type CatalogSyncState = {
  dailyDate: string;
  attemptsToday: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

const globalCatalog = globalThis as typeof globalThis & { xbzCatalogDatabase?: DatabaseSync };

function databasePath() {
  return path.join(process.cwd(), "data", "xbz-catalog.sqlite");
}

function openDefaultDatabase() {
  const file = databasePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrateCatalogDatabase(database);
  return database;
}

export function getCatalogDatabase() {
  if (!globalCatalog.xbzCatalogDatabase) globalCatalog.xbzCatalogDatabase = openDefaultDatabase();
  return globalCatalog.xbzCatalogDatabase;
}

export function migrateCatalogDatabase(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS xbz_catalog_products (
      id TEXT PRIMARY KEY,
      static_json TEXT NOT NULL,
      stock_main INTEGER NOT NULL DEFAULT 0,
      stock_available INTEGER NOT NULL DEFAULT 0,
      reliability TEXT NOT NULL DEFAULT '',
      restock_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      stock_updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS xbz_catalog_sync_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      daily_date TEXT NOT NULL,
      attempts_today INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT
    );
  `);
}

export function catalogProductCount(database: DatabaseSync) {
  return Number((database.prepare("SELECT COUNT(*) AS count FROM xbz_catalog_products").get() as { count: number }).count);
}

export function readCatalogProducts(database: DatabaseSync): Product[] {
  const rows = database.prepare(`
    SELECT static_json, stock_main, stock_available, reliability, restock_date
    FROM xbz_catalog_products ORDER BY rowid ASC
  `).all() as Array<{
    static_json: string; stock_main: number; stock_available: number;
    reliability: string; restock_date: string;
  }>;
  return rows.map((row) => ({
    ...(JSON.parse(row.static_json) as Product),
    stockMain: row.stock_main,
    stockAvailable: row.stock_available,
    reliability: row.reliability,
    restockDate: row.restock_date,
  }));
}

export function persistInitialCatalog(database: DatabaseSync, products: Product[], now: string) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO xbz_catalog_products
      (id, static_json, stock_main, stock_available, reliability, restock_date, created_at, stock_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const product of products) {
      insert.run(product.id, JSON.stringify(product), product.stockMain, product.stockAvailable,
        product.reliability, product.restockDate, now, now);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function updateCatalogStock(database: DatabaseSync, products: Product[], now: string) {
  const update = database.prepare(`
    UPDATE xbz_catalog_products SET stock_main = ?, stock_available = ?, reliability = ?,
      restock_date = ?, stock_updated_at = ? WHERE id = ?
  `);
  const insert = database.prepare(`
    INSERT OR IGNORE INTO xbz_catalog_products
      (id, static_json, stock_main, stock_available, reliability, restock_date, created_at, stock_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const product of products) {
      const result = update.run(product.stockMain, product.stockAvailable, product.reliability,
        product.restockDate, now, product.id);
      if (result.changes === 0) {
        insert.run(product.id, JSON.stringify(product), product.stockMain, product.stockAvailable,
          product.reliability, product.restockDate, now, now);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function readSyncState(database: DatabaseSync, date: string): CatalogSyncState {
  const row = database.prepare("SELECT * FROM xbz_catalog_sync_state WHERE singleton = 1").get() as {
    daily_date: string; attempts_today: number; last_attempt_at: string | null;
    last_success_at: string | null; last_error: string | null;
  } | undefined;
  if (!row || row.daily_date !== date) {
    return { dailyDate: date, attemptsToday: 0, lastAttemptAt: null,
      lastSuccessAt: row?.last_success_at ?? null, lastError: null };
  }
  return { dailyDate: row.daily_date, attemptsToday: row.attempts_today,
    lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at, lastError: row.last_error };
}

export function recordSyncAttempt(database: DatabaseSync, state: CatalogSyncState, now: string) {
  database.prepare(`
    INSERT INTO xbz_catalog_sync_state
      (singleton, daily_date, attempts_today, last_attempt_at, last_success_at, last_error)
    VALUES (1, ?, ?, ?, ?, NULL)
    ON CONFLICT(singleton) DO UPDATE SET daily_date=excluded.daily_date,
      attempts_today=excluded.attempts_today, last_attempt_at=excluded.last_attempt_at,
      last_success_at=excluded.last_success_at, last_error=NULL
  `).run(state.dailyDate, state.attemptsToday + 1, now, state.lastSuccessAt);
}

export function markSyncQuotaExhausted(database: DatabaseSync, date: string) {
  database.prepare(`UPDATE xbz_catalog_sync_state SET attempts_today = 24
    WHERE singleton = 1 AND daily_date = ?`).run(date);
}

export function recordSyncResult(database: DatabaseSync, now: string, error: string | null) {
  database.prepare(`UPDATE xbz_catalog_sync_state SET
    last_success_at = CASE WHEN ? IS NULL THEN ? ELSE last_success_at END,
    last_error = ? WHERE singleton = 1`).run(error, now, error);
}
