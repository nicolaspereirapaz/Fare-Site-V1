import type { DatabaseSync } from "node:sqlite";
import { getProducts } from "@/lib/xbz";
import {
  catalogProductCount, getCatalogDatabase, markSyncQuotaExhausted, persistInitialCatalog,
  readCatalogProducts, readSyncState, recordSyncAttempt, recordSyncResult, updateCatalogStock,
} from "@/lib/xbzCatalogRepository";
import { readSupplierProducts, refreshSuppliersInBackground } from "@/lib/suppliers/catalog";
import { assignFareCodes } from "@/lib/productCodes";
import { hideBrokenImages, readBrokenImages, refreshImageHealthInBackground } from "@/lib/imageHealth";

const DAILY_LIMIT = 24;
const BUSINESS_INTERVAL_MS = 37 * 60 * 1000;
const NIGHT_INTERVAL_MS = 75 * 60 * 1000;
const DAWN_INTERVAL_MS = 240 * 60 * 1000;
const TIME_ZONE = "America/Sao_Paulo";

const globalSync = globalThis as typeof globalThis & {
  xbzCatalogSync?: Promise<void>;
  xbzCatalogTimer?: ReturnType<typeof setInterval>;
};

function saoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function stockSyncInterval(date: Date) {
  const { hour } = saoPauloParts(date);
  if (hour >= 8 && hour < 19) return BUSINESS_INTERVAL_MS;
  if (hour >= 19) return NIGHT_INTERVAL_MS;
  return DAWN_INTERVAL_MS;
}

export function shouldRefreshStock(
  state: { attemptsToday: number; lastAttemptAt: string | null },
  now: Date,
) {
  if (state.attemptsToday >= DAILY_LIMIT) return false;
  if (!state.lastAttemptAt) return true;
  return now.getTime() - new Date(state.lastAttemptAt).getTime() >= stockSyncInterval(now);
}

async function synchronize(database: DatabaseSync, initial: boolean, now: Date) {
  const timestamp = now.toISOString();
  const { date } = saoPauloParts(now);
  const state = readSyncState(database, date);
  if (!initial && !shouldRefreshStock(state, now)) return;
  if (state.attemptsToday >= DAILY_LIMIT) return;

  recordSyncAttempt(database, state, timestamp);
  try {
    const source = await getProducts(true);
    if (initial) persistInitialCatalog(database, source.products, timestamp);
    else updateCatalogStock(database, source.products, timestamp);
    recordSyncResult(database, timestamp, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização.";
    recordSyncResult(database, timestamp, message);
    if (message.includes("Limite diário") || message.includes("HTTP 403")) {
      markSyncQuotaExhausted(database, date);
    }
    throw error;
  }
}

function runSingleFlight(database: DatabaseSync, initial: boolean, now = new Date()) {
  if (!globalSync.xbzCatalogSync) {
    globalSync.xbzCatalogSync = synchronize(database, initial, now).finally(() => {
      globalSync.xbzCatalogSync = undefined;
    });
  }
  return globalSync.xbzCatalogSync;
}

function ensureScheduler(database: DatabaseSync) {
  if (globalSync.xbzCatalogTimer) return;
  globalSync.xbzCatalogTimer = setInterval(() => {
    void runSingleFlight(database, false, new Date()).catch(() => undefined);
  }, 60_000);
  globalSync.xbzCatalogTimer.unref?.();
}

export async function getLocalCatalog(now = new Date()) {
  const database = getCatalogDatabase();
  const empty = catalogProductCount(database) === 0;
  if (empty) await runSingleFlight(database, true, now);
  ensureScheduler(database);
  if (!empty) void runSingleFlight(database, false, now).catch(() => undefined);

  refreshSuppliersInBackground(database, now);

  const { date } = saoPauloParts(now);
  const state = readSyncState(database, date);
  // XBZ + Spot + Asia Import, todos nas mesmas categorias da loja.
  const raw = [...readCatalogProducts(database), ...readSupplierProducts(database)];
  // Verificação diária das fotos (em segundo plano); foto que não abre não aparece na loja.
  refreshImageHealthInBackground(database, raw, now);
  const products = hideBrokenImages(raw, readBrokenImages(database));
  return {
    products,
    /** Código Fare Foto (X/S/A + número) por produto; o número de um produto nunca muda. */
    fareCodes: assignFareCodes(database, products),
    fetchedAt: state.lastSuccessAt ?? now.toISOString(),
    cached: true,
    sync: {
      attemptsToday: state.attemptsToday,
      dailyLimit: DAILY_LIMIT,
      lastSuccessAt: state.lastSuccessAt,
    },
  };
}

export const XBZ_SYNC_POLICY = {
  dailyLimit: DAILY_LIMIT,
  businessIntervalMinutes: BUSINESS_INTERVAL_MS / 60_000,
  nightIntervalMinutes: NIGHT_INTERVAL_MS / 60_000,
  dawnIntervalMinutes: DAWN_INTERVAL_MS / 60_000,
  timeZone: TIME_ZONE,
} as const;
