import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Product } from "@/lib/xbz";
import {
  catalogProductCount, migrateCatalogDatabase, persistInitialCatalog, readCatalogProducts,
  readSyncState, recordSyncAttempt, updateCatalogStock,
} from "@/lib/xbzCatalogRepository";
import { shouldRefreshStock, stockSyncInterval, XBZ_SYNC_POLICY } from "@/lib/xbzCatalogService";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "produto-1", sku: "SKU-1", compoundCode: "09323-ROSA", familyCode: "09323",
    name: "Caneta original", description: "Descrição original", productUrl: "https://example.test/p",
    imageUrl: "https://example.test/p.jpg", category: "Canetas", subcategory: "Plásticas",
    primaryColor: "Rosa", secondaryColor: "", price: 3.5, formattedPrice: "R$ 3,50",
    clearance: false, stockMain: 10, stockAvailable: 12, reliability: "OK", restockDate: "",
    ...overrides,
  };
}

describe("catálogo XBZ local", () => {
  let database: DatabaseSync;
  beforeEach(() => { database = new DatabaseSync(":memory:"); migrateCatalogDatabase(database); });
  afterEach(() => database.close());

  it("persiste todos os dados somente na primeira carga", () => {
    persistInitialCatalog(database, [product()], "2026-09-28T12:00:00.000Z");
    expect(catalogProductCount(database)).toBe(1);
    expect(readCatalogProducts(database)[0]).toMatchObject({ name: "Caneta original", stockAvailable: 12, price: 3.5 });
  });

  it("na sincronização recorrente altera estoque, mas preserva metadados e preço", () => {
    persistInitialCatalog(database, [product()], "2026-09-28T12:00:00.000Z");
    updateCatalogStock(database, [product({ name: "NOME QUE NÃO DEVE ENTRAR", price: 999, imageUrl: "outra", stockMain: 2, stockAvailable: 4 })], "2026-09-28T13:00:00.000Z");
    expect(readCatalogProducts(database)[0]).toMatchObject({
      name: "Caneta original", price: 3.5, imageUrl: "https://example.test/p.jpg",
      stockMain: 2, stockAvailable: 4,
    });
  });

  it("cadastra uma família nova uma única vez quando surge numa atualização", () => {
    persistInitialCatalog(database, [product()], "2026-09-28T12:00:00.000Z");
    updateCatalogStock(database, [product(), product({ id: "produto-2", familyCode: "19228", name: "Kit manicure" })], "2026-09-28T13:00:00.000Z");
    expect(catalogProductCount(database)).toBe(2);
  });

  it("controla tentativas por dia e reinicia o contador na data seguinte", () => {
    const first = readSyncState(database, "2026-09-28");
    recordSyncAttempt(database, first, "2026-09-28T12:00:00.000Z");
    expect(readSyncState(database, "2026-09-28").attemptsToday).toBe(1);
    expect(readSyncState(database, "2026-09-29").attemptsToday).toBe(0);
  });
});

describe("agenda de estoque XBZ", () => {
  it("prioriza horário comercial, reduz à noite e quase não consulta de madrugada", () => {
    expect(stockSyncInterval(new Date("2026-09-28T15:00:00.000Z"))).toBe(37 * 60_000);
    expect(stockSyncInterval(new Date("2026-09-28T23:00:00.000Z"))).toBe(75 * 60_000);
    expect(stockSyncInterval(new Date("2026-09-28T06:00:00.000Z"))).toBe(240 * 60_000);
  });

  it("bloqueia rigidamente ao atingir 24 tentativas diárias", () => {
    expect(XBZ_SYNC_POLICY.dailyLimit).toBe(24);
    expect(shouldRefreshStock({ attemptsToday: 24, lastAttemptAt: null }, new Date())).toBe(false);
  });
});
