import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { BuilderProduct } from "@/lib/backoffice/quoteBuilder";
import { createQuoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderHandlers";
import { createQuote, findQuoteById } from "@/lib/quotes/repository";

const CANETA: BuilderProduct = {
  publicId: "cf93", name: "Caneta Plástica", category: "Canetas e Lápis", imageUrl: "", fareCode: "X10304", supplier: "xbz", supplierCode: "00518",
  variants: [{ label: "Azul", cost: 0.72, stock: 5000, sku: "00518-AZU", imageUrl: "" }], spotOptions: [],
};

function setup(role = "vendedor") {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 1)`);
  db.exec(`CREATE TABLE fare_customer_profiles (user_id TEXT PRIMARY KEY, phone TEXT, document TEXT, company_name TEXT, trade_name TEXT)`);
  db.prepare("INSERT INTO user VALUES ('u1', 'Ana Souza', 'ana@exemplo.com', 1)").run();
  db.prepare("INSERT INTO fare_customer_profiles VALUES ('u1', '(11) 98888-7777', '', 'Padaria Boa Vista', '')").run();
  const handlers = createQuoteBuilderHandlers({
    getSession: vi.fn().mockResolvedValue(role ? { user: { id: "s1", name: "Bia", role } } : null),
    database: () => db,
    catalog: async () => ({ lookup: (id) => (id === "cf93" ? CANETA : null), search: () => [CANETA] }),
  });
  return { db, handlers };
}
const post = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("editor de orçamentos do painel", () => {
  it("só a equipe usa", async () => {
    const { handlers } = setup("cliente");
    expect((await handlers.searchCustomers(new Request("http://x/api?q=a"))).status).toBe(403);
    expect((await setup("").handlers.preview(post({ items: [] }))).status).toBe(401);
  });

  it("cadastro de cliente que já existe devolve 409 com o cadastro encontrado", async () => {
    const { handlers } = setup();
    const response = await handlers.createCustomer(post({ name: "Ana", phone: "11 98888-7777" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DUPLICATE", matches: [{ ref: "conta:u1", name: "Ana Souza", by: ["WhatsApp"] }] });
    const created = await handlers.createCustomer(post({ name: "Marcos", phone: "(11) 95555-8899" }));
    expect(created.status).toBe(201);
  });

  it("busca de produto não expõe o SKU", async () => {
    const { handlers } = setup();
    const body = await (await handlers.searchProducts(new Request("http://x/api?q=caneta"))).json() as { products: Array<{ variants: Array<Record<string, unknown>> }> };
    expect(body.products[0].variants[0]).toEqual({ label: "Azul", cost: 0.72, stock: 5000, imageUrl: "" });
  });

  it("cria o orçamento com preço do servidor (ignora preço vindo do navegador)", async () => {
    const { db, handlers } = setup();
    const response = await handlers.create(post({
      customerRef: "conta:u1", idempotencyKey: "orc-12345678", internalNotes: " entrega 30/10 ",
      items: [{ id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 300, unitPrice: 0.01, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo" }] }],
    }));
    expect(response.status).toBe(201);
    const { id } = await response.json() as { id: string };
    expect(findQuoteById(db, id)).toMatchObject({
      userId: "u1", createdBy: "Bia", internalNotes: "entrega 30/10", totalCents: 113100, // 3,77 × 300
      customer: { name: "Ana Souza", company: "Padaria Boa Vista", phone: "(11) 98888-7777" },
    });
  });

  it("não cria com item inválido e diz qual", async () => {
    const { handlers } = setup();
    const response = await handlers.create(post({ customerRef: "conta:u1", idempotencyKey: "orc-12345678", items: [{ id: "a", source: "catalogo", publicId: "sumiu", quantity: 10 }] }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ preview: [{ id: "a", ok: false }] });
  });

  it("edita um orçamento do site com várias gravações; conflito vira 409", async () => {
    const { db, handlers } = setup();
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "k", customer: { name: "Ana" }, items: [{ id: "l1", productName: "Caneta", slug: "brindes/cf93", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: null }] });
    const state = await (await handlers.read(new Request("http://x"), quote.id)).json() as { items: unknown[]; updatedAt: string };
    expect(state.items).toEqual([{ id: "l1", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 100, gravacoes: [] }]);
    expect((state as unknown as { products: Record<string, { name: string; variants: Array<Record<string, unknown>> }> }).products.cf93).toMatchObject({ name: "Caneta Plástica", fareCode: "X10304", supplierCode: "XBZ 00518" });
    expect((state as unknown as { products: Record<string, { variants: Array<Record<string, unknown>> }> }).products.cf93.variants[0]).not.toHaveProperty("sku");

    const put = (updatedAt: string) => new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      updatedAt, internalNotes: "", items: [{ ...state.items[0] as object, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo" }, { tecnica: { tipo: "laser" }, local: "Clipe" }] }],
    }) });
    expect((await handlers.update(put(state.updatedAt), quote.id)).status).toBe(200);
    expect(findQuoteById(db, quote.id)?.items[0]).toMatchObject({ unitPrice: 6.44, gravacoes: [{ descricao: "Laser", local: "Corpo" }, { descricao: "Laser", local: "Clipe" }] });
    expect((await handlers.update(put(state.updatedAt), quote.id)).status).toBe(409);
  });
});
