import type { DatabaseSync } from "node:sqlite";
import { isSiteProductVisible } from "@/lib/siteProductVisibility";
import { getProducts, groupAvailableProducts, type Product } from "@/lib/xbz";
import { fillXbzSpecsInBackground } from "@/lib/productSpecs";
import {
  catalogProductCount, getCatalogDatabase, markSyncQuotaExhausted, persistInitialCatalog,
  readCatalogProducts, readSyncState, recordSyncAttempt, recordSyncResult, updateCatalogStock,
} from "@/lib/xbzCatalogRepository";
import { readSupplierProducts, refreshSuppliersInBackground } from "@/lib/suppliers/catalog";
import { assignFareCodes, supplierOf } from "@/lib/productCodes";
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

type BuiltCatalog = { version: string; raw: Product[]; products: Product[]; fareCodes: Map<string, string> };
// Um catálogo guardado por banco aberto (nos testes cada teste tem o seu).
const globalCatalogCache = globalThis as typeof globalThis & { localCatalogs?: WeakMap<DatabaseSync, BuiltCatalog> };
/** Muda a cada gravação no banco do catálogo: data_version (outras conexões) + total_changes (esta conexão). */
export function catalogVersion(database: DatabaseSync) {
  const dataVersion = (database.prepare("PRAGMA data_version").get() as { data_version: number }).data_version;
  const changes = (database.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
  return `${dataVersion}:${changes}`;
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
  // Catálogo montado fica na memória até o banco do catálogo mudar (sincronização, estoque, códigos, fotos quebradas).
  // Montar de novo levava ~1 s no oraculo e acontecia em toda página (menu, home, brindes).
  const version = catalogVersion(database);
  const cache = (globalCatalogCache.localCatalogs ??= new WeakMap());
  let built = cache.get(database);
  if (built?.version !== version) {
    // XBZ + Spot + Asia Import, todos nas mesmas categorias da loja.
    const raw = [...readCatalogProducts(database), ...readSupplierProducts(database)];
    const products = hideBrokenImages(raw, readBrokenImages(database)).filter(isSiteProductVisible);
    /** Código Fare Foto (X/S/A + número) por produto; o número de um produto nunca muda. */
    const fareCodes = assignFareCodes(database, products);
    // Versão lida depois de gravar os códigos novos, para a próxima visita já usar a memória.
    built = { version: catalogVersion(database), raw, products, fareCodes };
    cache.set(database, built);
  }
  // Verificação diária das fotos (em segundo plano); foto que não abre não aparece na loja.
  refreshImageHealthInBackground(database, built.raw, now);
  // Medidas XBZ de todos os produtos à venda guardadas de antemão (a página do produto abre com elas na hora).
  const visible = built.products;
  fillXbzSpecsInBackground(database, () => groupAvailableProducts(visible)
    .map((product) => product.variants[0])
    .filter((first) => first && supplierOf(first) === "xbz")
    .map((first) => first.familyCode));
  const { products, fareCodes } = built;
  return {
    products,
    fareCodes,
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
