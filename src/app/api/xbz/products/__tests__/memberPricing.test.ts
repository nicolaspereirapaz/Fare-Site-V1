import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/xbz";

const session = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/auth/server", () => ({ getCurrentSession: async () => session.current }));

function variant(overrides: Partial<Product>): Product {
  return {
    id: "1", sku: "SKU-ROSA", compoundCode: "CC-1", familyCode: "FAM-1", name: "CANETA PLÁSTICA",
    description: "Caneta", productUrl: "", imageUrl: "https://cdn.exemplo/caneta.jpg", category: "Canetas",
    subcategory: "", primaryColor: "ROSA", secondaryColor: "", price: 0.82, formattedPrice: "R$ 0,82",
    clearance: false, stockMain: 100, stockAvailable: 100, reliability: "", ...overrides,
  } as Product;
}

const supplier = vi.hoisted(() => ({ liveCalls: 0 }));

// O site lê a cópia local do catálogo (atualizada algumas vezes por dia), nunca o fornecedor ao vivo.
vi.mock("@/lib/xbzCatalogService", () => ({
  getLocalCatalog: async () => ({
    products: [variant({}), variant({ id: "2", sku: "SKU-AZUL", primaryColor: "AZUL", price: 0.9 })],
    fetchedAt: "2026-09-29T12:00:00.000Z",
    cached: true,
  }),
}));

vi.mock("@/lib/xbz", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/xbz")>();
  return {
    ...original,
    getProducts: async () => {
      supplier.liveCalls += 1;
      throw new Error("The operation was aborted due to timeout");
    },
  };
});

const { GET: list } = await import("@/app/api/xbz/products/route");
const { GET: detail } = await import("@/app/api/xbz/products/[code]/route");
const { publicProductId } = await import("@/lib/publicCatalog");

const CODE = publicProductId("FAM-1");
const FORBIDDEN_KEYS = ["price", "formattedPrice", "internalCode", "sku", "compoundCode", "familyCode", "stockAvailable", "totalStock"];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); }
  }
  return keys;
}

async function getList() {
  return (await list(new Request("http://localhost/api/xbz/products"))).json();
}
async function getDetail() {
  const context = { params: Promise.resolve({ code: CODE }) } as never;
  return (await detail(new Request(`http://localhost/api/xbz/products/${CODE}`), context)).json();
}

describe("preço dos brindes só para clientes cadastrados", () => {
  beforeEach(() => { session.current = null; supplier.liveCalls = 0; });

  it("usa a cópia local do catálogo: funciona com o fornecedor lento ou fora do ar", async () => {
    const listing = await list(new Request("http://localhost/api/xbz/products?refresh=1"));
    const context = { params: Promise.resolve({ code: CODE }) } as never;
    const item = await detail(new Request(`http://localhost/api/xbz/products/${CODE}`), context);
    expect(listing.status).toBe(200);
    expect(item.status).toBe(200);
    expect(supplier.liveCalls).toBe(0);
  });

  it("visitante não recebe nenhum preço na lista nem no produto", async () => {
    const listing = await getList();
    const product = await getDetail();
    expect(listing.products[0].startingPrice).toBeUndefined();
    expect(listing.pricesVisible).toBe(false);
    expect(product.priceTiers).toBeUndefined();
    expect(product.quantityPricing).toBeUndefined();
    expect(product.pricesVisible).toBe(false);
  });

  it("cliente logado recebe 'a partir de', tabela e parâmetros de outra quantidade (regra da campanha)", async () => {
    session.current = { user: { id: "u1", role: "cliente" } };
    const listing = await getList();
    const product = await getDetail();
    // variação mais barata: 0,82 × 2 = 1,64 + R$ 100 ÷ 100 un. = 2,64
    expect(listing.products[0].startingPrice).toBe(2.64);
    expect(listing.pricesVisible).toBe(true);
    expect(product.product.startingPrice).toBe(2.64);
    expect(product.priceTiers).toEqual([
      { quantity: 50, unitPrice: 3.64 },
      { quantity: 100, unitPrice: 2.64 },
      { quantity: 250, unitPrice: 2.04 },
      { quantity: 500, unitPrice: 1.84 },
      { quantity: 1000, unitPrice: 1.74 },
    ]);
    expect(product.quantityPricing).toEqual({ unitSaleCents: 164, freightCents: 10000 });
    expect(product.pricesVisible).toBe(true);
  });

  it("nunca expõe custo, estoque nem códigos do fornecedor, logado ou não", async () => {
    for (const current of [null, { user: { id: "u1", role: "cliente" } }]) {
      session.current = current;
      const keys = new Set([...collectKeys(await getList()), ...collectKeys(await getDetail())]);
      for (const key of FORBIDDEN_KEYS) expect(keys.has(key), `chave ${key}`).toBe(false);
    }
  });

  it("resposta com preço não pode ser guardada em cache compartilhado", async () => {
    session.current = { user: { id: "u1", role: "cliente" } };
    const response = await list(new Request("http://localhost/api/xbz/products"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
