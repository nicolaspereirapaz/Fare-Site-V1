import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/xbz";
import { readSupplierProducts, readSupplierSyncState, replaceSupplierCatalog, supplierSyncDue } from "@/lib/suppliers/catalog";

function item(id: string, supplier: "spot" | "asia" = "spot"): Product {
  return {
    id, sku: id, compoundCode: id, familyCode: id, supplier, name: "Copo", description: "", productUrl: "", imageUrl: "x.jpg",
    category: "Canecas, Copos e Taças", subcategory: "", primaryColor: "Azul", secondaryColor: "", price: 5, formattedPrice: "",
    clearance: false, stockMain: 10, stockAvailable: 10, reliability: "", restockDate: "",
  };
}

describe("catálogo local dos fornecedores adicionais", () => {
  afterEach(() => vi.useRealTimers());

  it("cada sincronização substitui o catálogo daquele fornecedor sem mexer no outro", () => {
    const database = new DatabaseSync(":memory:");
    replaceSupplierCatalog(database, "spot", [item("spot:1"), item("spot:2")], "2026-10-11T10:00:00.000Z");
    replaceSupplierCatalog(database, "asia", [item("asia:1", "asia")], "2026-10-11T10:00:00.000Z");
    replaceSupplierCatalog(database, "spot", [item("spot:2")], "2026-10-11T13:00:00.000Z");

    expect(readSupplierProducts(database).map((product) => product.id)).toEqual(["asia:1", "spot:2"]);
    expect(readSupplierSyncState(database, "spot")).toMatchObject({ product_count: 1, last_error: null });
  });

  it("só sincroniza de novo depois do intervalo (ou 30 min após uma falha)", () => {
    const now = new Date("2026-10-11T12:00:00.000Z");
    const hours = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
    const interval = 3 * 3_600_000;

    expect(supplierSyncDue(null, interval, now)).toBe(true);
    expect(supplierSyncDue({ last_attempt_at: hours(1), last_success_at: hours(1), last_error: null, product_count: 1 }, interval, now)).toBe(false);
    expect(supplierSyncDue({ last_attempt_at: hours(3), last_success_at: hours(3), last_error: null, product_count: 1 }, interval, now)).toBe(true);
    expect(supplierSyncDue({ last_attempt_at: hours(0.25), last_success_at: null, last_error: "HTTP 500", product_count: 0 }, interval, now)).toBe(false);
    expect(supplierSyncDue({ last_attempt_at: hours(0.6), last_success_at: null, last_error: "HTTP 500", product_count: 0 }, interval, now)).toBe(true);
  });
});
