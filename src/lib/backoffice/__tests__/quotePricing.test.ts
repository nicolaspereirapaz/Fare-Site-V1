import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createQuotePricingHandlers, type PricingProduct } from "@/lib/backoffice/quotePricing";
import { createQuote, findQuoteById, priceQuoteItem, updateQuoteStatus } from "@/lib/quotes/repository";
import type { QuoteCartItem } from "@/lib/commerce";

const ITEMS: QuoteCartItem[] = [
  { id: "l1", productName: "Caneta Plástica", slug: "brindes/cf93", quantity: 100, selections: { "Variação": "Azul" }, artworkName: null, unitPrice: 2.64 },
  { id: "l2", productName: "Squeeze 500 ml", slug: "brindes/aa11", quantity: 50, selections: {}, artworkName: null, unitPrice: 12 },
];

describe("preço do item gravado no orçamento (banco)", () => {
  it("troca quantidade e preço do item, guarda a composição do custo e recalcula o total", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana" }, items: ITEMS });
    const costing = { custoProduto: 0.82, personalizacao: "Laser", detalhe: "R$ 1,00 por peça", personalizacaoUnitaria: 1, custoPersonalizacaoTotal: 200, freteFornecedor: 100, tecnica: { tipo: "laser" as const }, por: "Bia", em: "2026-10-12T10:00:00.000Z" };
    const updated = priceQuoteItem(db, { quoteId: quote.id, itemIndex: 0, quantity: 200, unitPrice: 4.14, costing });

    expect(updated.items[0]).toMatchObject({ quantity: 200, unitPrice: 4.14, costing });
    expect(updated.items[1].unitPrice).toBe(12);
    expect(updated.totalCents).toBe(82800 + 60000);
    expect(findQuoteById(db, quote.id)?.items[0].costing?.personalizacao).toBe("Laser");
  });

  it("não altera orçamento que já virou pedido ou foi encerrado", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-2-aaaa", customer: { name: "Ana" }, items: ITEMS });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "encerrado" });
    expect(() => priceQuoteItem(db, { quoteId: quote.id, itemIndex: 0, quantity: 100, unitPrice: 1, costing: null })).toThrow(/não pode/);
  });
});

const CANETA: PricingProduct = {
  name: "Caneta Plástica", category: "Canetas e Lápis", supplier: "xbz", cost: 0.82, fareCode: "X10001", supplierCode: "XBZ 13433", spotReference: null,
};
const SPOT_CANETA: PricingProduct = { ...CANETA, supplier: "spot", supplierCode: "Spot 11110", spotReference: "11110" };
const SPOT_LASER = { id: "11110.LSR", tecnica: "Laser", local: "Lateral clipe", componente: "Esferográfica", area: "40 × 4 mm", cores: 1, padrao: false, faixas: [{ minimo: 1, preco: 64.99 }, { minimo: 100, preco: 2.85 }] };

function setup(role: string | null = "vendedor", product: PricingProduct | null = CANETA) {
  const db = new DatabaseSync(":memory:");
  const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-9-aaaa", customer: { name: "Ana" }, items: ITEMS });
  const handlers = createQuotePricingHandlers({
    getSession: vi.fn().mockResolvedValue(role ? { user: { id: "s1", name: "Bia", role } } : null),
    findQuote: (id) => findQuoteById(db, id),
    lookupProduct: async () => product,
    spotOptions: (reference) => (reference === "11110" ? [SPOT_LASER] : []),
    saveItem: (input) => priceQuoteItem(db, input),
  });
  return { db, quote, handlers };
}
const get = () => new Request("http://localhost/api/backoffice/quotes/q/itens/0");
const post = (body: unknown) => new Request("http://localhost/api/backoffice/quotes/q/itens/0", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("formar preço do item no painel (API)", () => {
  it("só equipe logada", async () => {
    const { quote, handlers } = setup(null);
    expect((await handlers.read(get(), quote.id, 0)).status).toBe(401);
    const cliente = setup("cliente");
    expect((await cliente.handlers.read(get(), cliente.quote.id, 0)).status).toBe(403);
  });

  it("lê o custo do produto no catálogo (vendedor vê o custo) e as técnicas disponíveis", async () => {
    const { quote, handlers } = setup();
    const payload = await (await handlers.read(get(), quote.id, 0)).json();
    expect(payload.product).toMatchObject({ name: "Caneta Plástica", cost: 0.82, fareCode: "X10001", supplierCode: "XBZ 13433" });
    expect(payload.item).toMatchObject({ quantity: 100, productName: "Caneta Plástica" });
    expect(payload.spotOptions).toEqual([]);
    expect(payload.techniques.map((t: { tipo: string }) => t.tipo)).toEqual(["nenhuma", "laser", "dtf-textil", "dtf-uv", "manual"]);
  });

  it("produto da Spot traz as personalizações da Spot", async () => {
    const { quote, handlers } = setup("vendedor", SPOT_CANETA);
    const payload = await (await handlers.read(get(), quote.id, 0)).json();
    expect(payload.spotOptions).toEqual([SPOT_LASER]);
    expect(payload.techniques.map((t: { tipo: string }) => t.tipo)).toContain("spot");
  });

  it("simular não grava; aplicar grava o preço calculado no servidor (custo vem do catálogo, não do navegador)", async () => {
    const { db, quote, handlers } = setup();
    const simulated = await (await handlers.price(post({ quantidade: 100, tecnica: { tipo: "laser" }, custoProduto: 0.01 }), quote.id, 0)).json();
    expect(simulated.result).toMatchObject({ precoUnitarioFinal: 4.64, totalCliente: 464, personalizacaoUnitaria: 1 });
    expect(findQuoteById(db, quote.id)?.items[0].unitPrice).toBe(2.64);

    const applied = await handlers.price(post({ quantidade: 100, tecnica: { tipo: "laser" }, aplicar: true }), quote.id, 0);
    expect(applied.status).toBe(200);
    const saved = findQuoteById(db, quote.id)!.items[0];
    expect(saved.unitPrice).toBe(4.64);
    expect(saved.costing).toMatchObject({ custoProduto: 0.82, personalizacao: "Laser", personalizacaoUnitaria: 1, por: "Bia" });
  });

  it("Spot: usa o preço da opção escolhida, pela faixa da quantidade", async () => {
    const { quote, handlers } = setup("vendedor", SPOT_CANETA);
    const payload = await (await handlers.price(post({ quantidade: 100, tecnica: { tipo: "spot", opcaoId: "11110.LSR" } }), quote.id, 0)).json();
    expect(payload.result).toMatchObject({ personalizacaoUnitaria: 2.85, precoUnitarioFinal: 8.34 }); // (0,82 + 2,85) × 2 + 1
    const unknown = await handlers.price(post({ quantidade: 100, tecnica: { tipo: "spot", opcaoId: "outra" } }), quote.id, 0);
    expect(unknown.status).toBe(400);
  });

  it("DTF com tamanho inválido devolve a mensagem para o vendedor", async () => {
    const { quote, handlers } = setup();
    const response = await handlers.price(post({ quantidade: 10, tecnica: { tipo: "dtf-textil", larguraCm: 70, alturaCm: 80 } }), quote.id, 0);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/não cabe/);
  });

  it("produto fora do catálogo: o vendedor informa o custo do produto", async () => {
    const { quote, handlers } = setup("vendedor", null);
    expect((await handlers.price(post({ quantidade: 100, tecnica: { tipo: "laser" } }), quote.id, 0)).status).toBe(400);
    const ok = await (await handlers.price(post({ quantidade: 100, tecnica: { tipo: "manual", nome: "Silk", custoUnitario: 1 }, custoProduto: 2 }), quote.id, 0)).json();
    expect(ok.result.precoUnitarioFinal).toBe(7); // (2 + 1) × 2 + 1
  });
});
