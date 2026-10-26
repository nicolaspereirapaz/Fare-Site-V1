import { describe, expect, it } from "vitest";
import { buildQuoteItems, draftFromItem, parseDraftItems, type BuilderProduct } from "@/lib/backoffice/quoteBuilder";

const CANETA: BuilderProduct = {
  publicId: "cf93", name: "Caneta Plástica c/ Det. Emborrachado", category: "Canetas e Lápis", imageUrl: "https://cdn/caneta.jpg",
  fareCode: "X10304", supplier: "xbz", supplierCode: "00518",
  variants: [
    { label: "Azul", cost: 0.72, stock: 5000, sku: "00518-AZU", imageUrl: "https://cdn/azul.jpg" },
    { label: "Preto", cost: 0.72, stock: 120, sku: "00518-PRE", imageUrl: "https://cdn/preto.jpg" },
  ],
  spotOptions: [],
};
const SPOT: BuilderProduct = {
  ...CANETA, publicId: "sp11", name: "Caneta Spot", fareCode: "S10001", supplier: "spot", supplierCode: "11110",
  variants: [{ label: "Azul", cost: 0.82, stock: 900, sku: "11110-105", imageUrl: "" }],
  spotOptions: [{ id: "11110.TAMP", tecnica: "Tampografia", local: "Clipe", componente: "", area: "40 × 5 mm", cores: 1, padrao: true, faixas: [{ minimo: 1, preco: 9 }, { minimo: 100, preco: 3.04 }] }],
};
const lookup = (publicId: string) => ({ cf93: CANETA, sp11: SPOT } as Record<string, BuilderProduct>)[publicId] ?? null;
const actor = { name: "Bia" };
const NOW = "2026-10-13T12:00:00.000Z";

describe("itens do orçamento montados no servidor", () => {
  it("produto do catálogo com 2 gravações: custo da cor escolhida, preço e códigos para a equipe", () => {
    const { items, preview, totals } = buildQuoteItems([
      { id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 300, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo" }, { tecnica: { tipo: "laser" }, local: "Clipe" }] },
    ], lookup, actor, NOW);

    expect(preview[0]).toMatchObject({ id: "a", ok: true, unitPrice: 5.78, total: 1734, productCost: 0.72 });
    expect(items[0]).toMatchObject({
      id: "a", productName: CANETA.name, slug: "brindes/cf93", quantity: 300, selections: { "Variação": "Azul" }, unitPrice: 5.78,
      codes: { fare: "X10304", supplier: "xbz", supplierCode: "00518", sku: "00518-AZU" },
      gravacoes: [{ descricao: "Laser", local: "Corpo" }, { descricao: "Laser", local: "Clipe" }],
    });
    expect(items[0].costing).toMatchObject({ custoProduto: 0.72, personalizacao: "Laser (Corpo) + Laser (Clipe)", personalizacaoUnitaria: 2, por: "Bia", em: NOW });
    expect(items[0].costing?.gravacoes).toHaveLength(2);
    expect(totals).toEqual({ total: 1734, cost: 916, margin: 818, pending: 0 });
  });

  it("sem gravação o preço é igual ao do site", () => {
    const { preview } = buildQuoteItems([{ id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 100, gravacoes: [] }], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, unitPrice: 2.44 }); // 0,72 × 2 + 100/100
  });

  it("personalização da Spot só pela opção da própria Spot (preço por faixa)", () => {
    const { items, preview } = buildQuoteItems([
      { id: "s", source: "catalogo", publicId: "sp11", variant: "Azul", quantity: 100, gravacoes: [{ tecnica: { tipo: "spot", opcaoId: "11110.TAMP" }, local: "" }] },
    ], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, unitPrice: Math.round(((0.82 + 3.04) * 2 * 100 * 100 + 10000) / 100) / 100 });
    expect(items[0].gravacoes).toEqual([{ descricao: "Tampografia · Clipe", local: "" }]);
    expect(items[0].costing?.gravacoes?.[0].tecnica).toEqual({ tipo: "spot", opcaoId: "11110.TAMP" });

    const outro = buildQuoteItems([
      { id: "x", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 100, gravacoes: [{ tecnica: { tipo: "spot", opcaoId: "11110.TAMP" }, local: "" }] },
    ], lookup, actor, NOW);
    expect(outro.preview[0]).toMatchObject({ ok: false, error: expect.stringMatching(/Spot/) });
  });

  it("item fora do catálogo: nome e custo do vendedor, sem link de produto", () => {
    const { items, preview } = buildQuoteItems([
      { id: "b", source: "avulso", name: "Banner lona 90×120 cm", cost: 38, quantity: 2, gravacoes: [] },
    ], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, unitPrice: 126, total: 252 });
    expect(items[0]).toMatchObject({ productName: "Banner lona 90×120 cm", selections: {}, unitPrice: 126, codes: null });
    expect(items[0].slug).toMatch(/^avulso:/);
    expect(items[0].costing?.custoProduto).toBe(38);
  });

  it("aponta o erro de cada item sem derrubar os outros; o total só soma os itens válidos", () => {
    const { preview, totals } = buildQuoteItems([
      { id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 100, gravacoes: [{ tecnica: { tipo: "dtf-uv", larguraCm: 0, alturaCm: 5 }, local: "" }] },
      { id: "b", source: "catalogo", publicId: "nao-existe", variant: "", quantity: 10, gravacoes: [] },
      { id: "c", source: "avulso", name: "Banner", cost: 38, quantity: 2, gravacoes: [] },
    ], lookup, actor, NOW);
    expect(preview.map((item) => item.ok)).toEqual([false, false, true]);
    expect(preview[0]).toMatchObject({ error: expect.stringMatching(/largura/i) });
    expect(preview[1]).toMatchObject({ error: expect.stringMatching(/não está mais no catálogo/i) });
    expect(totals).toMatchObject({ total: 252, pending: 2 });
  });

  it("cor que não existe mais vira erro do item, não troca de cor sozinha", () => {
    const { items, preview } = buildQuoteItems([{ id: "a", source: "catalogo", publicId: "cf93", variant: "Cor removida", quantity: 100, gravacoes: [] }], lookup, actor, NOW);
    expect(items).toHaveLength(0);
    expect(preview[0]).toMatchObject({ id: "a", ok: false });
    expect((preview[0] as { error: string }).error).toMatch(/cor/i);
  });

  it("avisa quando a cor escolhida não tem estoque para a quantidade", () => {
    const { preview } = buildQuoteItems([{ id: "a", source: "catalogo", publicId: "cf93", variant: "Preto", quantity: 300, gravacoes: [] }], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, stockWarning: "Estoque da cor: 120 un." });
  });
});

describe("rascunho vindo do navegador", () => {
  it("aceita só o formato esperado (custo do catálogo nunca vem do navegador)", () => {
    const drafts = parseDraftItems([
      { id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: "300", cost: 0.01, unitPrice: 0.01, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo" }] },
      { id: "b", source: "avulso", name: " Banner ", cost: "38,50", quantity: 2 },
    ]);
    expect(drafts).toEqual([
      { id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 300, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo" }] },
      { id: "b", source: "avulso", name: "Banner", cost: 38.5, quantity: 2, gravacoes: [] },
    ]);
  });

  it("recusa lista vazia, itens demais ou quantidade inválida", () => {
    expect(() => parseDraftItems([])).toThrow(/produto/i);
    expect(() => parseDraftItems("x")).toThrow();
    expect(() => parseDraftItems(Array.from({ length: 61 }, (_, i) => ({ id: String(i), source: "avulso", name: "a", cost: 1, quantity: 1 })))).toThrow(/60/);
    expect(() => parseDraftItems([{ id: "a", source: "avulso", name: "a", cost: 1, quantity: 0 }])).toThrow(/quantidade/i);
  });
});

describe("abrir de novo um orçamento para editar", () => {
  it("item do site sem preço formado vira rascunho sem gravação", () => {
    expect(draftFromItem({ id: "l1", productName: "Caneta", slug: "brindes/cf93", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.44 }))
      .toEqual({ id: "l1", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 100, gravacoes: [] });
  });

  it("item montado no painel volta com as gravações e o custo do avulso", () => {
    const { items } = buildQuoteItems([
      { id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 300, gravacoes: [{ tecnica: { tipo: "dtf-uv", larguraCm: 6, alturaCm: 6 }, local: "Verso" }] },
      { id: "b", source: "avulso", name: "Banner", cost: 38, quantity: 2, gravacoes: [{ tecnica: { tipo: "manual", nome: "Ilhós", custoUnitario: 1.5 }, local: "" }] },
    ], lookup, actor, NOW);
    expect(items.map(draftFromItem)).toEqual([
      { id: "a", source: "catalogo", publicId: "cf93", variant: "Azul", quantity: 300, gravacoes: [{ tecnica: { tipo: "dtf-uv", larguraCm: 6, alturaCm: 6 }, local: "Verso" }] },
      { id: "b", source: "avulso", name: "Banner", cost: 38, quantity: 2, gravacoes: [{ tecnica: { tipo: "manual", nome: "Ilhós", custoUnitario: 1.5 }, local: "" }] },
    ]);
  });

  it("preço formado antes (1 personalização) vira 1 gravação", () => {
    const draft = draftFromItem({
      id: "l1", productName: "Caneta", slug: "brindes/cf93", quantity: 100, selections: {}, unitPrice: 4.64,
      costing: { custoProduto: 0.82, personalizacao: "Laser", detalhe: "", personalizacaoUnitaria: 1, custoPersonalizacaoTotal: 100, freteFornecedor: 100, tecnica: { tipo: "laser" }, por: "Bia", em: NOW },
    });
    expect(draft.gravacoes).toEqual([{ tecnica: { tipo: "laser" }, local: "" }]);
  });
});

describe("valores digitados à mão pela equipe", () => {
  const base = { id: "a", source: "catalogo" as const, publicId: "cf93", variant: "Azul", quantity: 300, gravacoes: [] };

  it("custo do produto à mão substitui o do catálogo e recalcula o preço", () => {
    const { preview, items } = buildQuoteItems([{ ...base, costOverride: 1 }], lookup, actor, NOW);
    // (1 × 2 × 300 + 100) / 300 = 2,3333 -> 2,34
    expect(preview[0]).toMatchObject({ ok: true, productCost: 1, unitPrice: 2.34, total: 702, cost: 400, manual: { cost: true, price: false } });
    expect(items[0].costing).toMatchObject({ custoProduto: 1, manual: { custoProduto: true } });
  });

  it("preço de venda à mão vale no lugar do calculado; a margem usa o custo real", () => {
    const { preview, items, totals } = buildQuoteItems([{ ...base, priceOverride: 2.5 }], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, unitPrice: 2.5, total: 750, cost: 316, manual: { cost: false, price: true }, suggestedPrice: 1.78 });
    expect(items[0]).toMatchObject({ unitPrice: 2.5 });
    expect(items[0].costing).toMatchObject({ manual: { precoVenda: true } });
    expect(totals).toMatchObject({ total: 750, cost: 316, margin: 434 });
  });

  it("custo da gravação à mão substitui o calculado", () => {
    const { preview, items } = buildQuoteItems([{
      ...base, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo", custoOverride: 0.5 }],
    }], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, gravacoes: [{ descricao: "Laser", custoUnitario: 0.5, custoTotal: 150, manual: true }] });
    // (0,72 + 0,50) × 2 × 300 + 100 = 832 / 300 = 2,7733 -> 2,78
    expect(preview[0]).toMatchObject({ unitPrice: 2.78 });
    expect(items[0].costing?.gravacoes?.[0]).toMatchObject({ custoUnitario: 0.5, custoTotal: 150, manual: true });
  });

  it("valores à mão inválidos viram erro no item", () => {
    const negative = buildQuoteItems([{ ...base, priceOverride: -1 }], lookup, actor, NOW);
    expect(negative.preview[0]).toMatchObject({ ok: false, error: "Preço de venda inválido." });
    const zero = buildQuoteItems([{ ...base, priceOverride: 0 }], lookup, actor, NOW);
    expect(zero.preview[0]).toMatchObject({ ok: false, error: "Preço de venda inválido." });
  });

  it("lê os valores do navegador com vírgula; vazio = automático", () => {
    const [item] = parseDraftItems([{ ...base, costOverride: "1,25", priceOverride: "", gravacoes: [{ tecnica: { tipo: "laser" }, local: "", custoOverride: "0,4" }] }]);
    expect(item).toMatchObject({ costOverride: 1.25, gravacoes: [{ custoOverride: 0.4 }] });
    expect(item).not.toHaveProperty("priceOverride");
    expect(() => parseDraftItems([{ ...base, costOverride: "abc" }])).toThrow("Item 1: custo inválido.");
  });

  it("reabrir o orçamento traz os valores digitados de volta", () => {
    const { items } = buildQuoteItems([{ ...base, costOverride: 1, priceOverride: 2.5, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo", custoOverride: 0.5 }] }], lookup, actor, NOW);
    expect(draftFromItem(items[0])).toEqual({ ...base, costOverride: 1, priceOverride: 2.5, gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo", custoOverride: 0.5 }] });
  });
});

describe("precisão dos valores digitados (revisão)", () => {
  const base = { id: "a", source: "catalogo" as const, publicId: "cf93", variant: "Azul", quantity: 1, gravacoes: [] };

  it("custo com 3 casas não perde o centavo: 1,001 × 2 + 100 = 102,002 → R$ 102,01", () => {
    const { preview } = buildQuoteItems([{ ...base, costOverride: 1.001 }], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: true, unitPrice: 102.01 });
  });

  it("preço digitado que arredonda para R$ 0,00 é recusado", () => {
    const { preview } = buildQuoteItems([{ ...base, priceOverride: 0.004 }], lookup, actor, NOW);
    expect(preview[0]).toMatchObject({ ok: false, error: "Preço de venda inválido." });
  });
});

describe("imagem do item fora do catálogo", () => {
  it("só aceita nome de arquivo do envio, vai para o item e volta ao rascunho", () => {
    const file = "0b3c1a2e-1111-4222-8333-944455556666.jpg";
    const drafts = parseDraftItems([
      { id: "b", source: "avulso", name: "Banner", cost: 38, quantity: 2, mockup: file },
      { id: "c", source: "avulso", name: "Banner", cost: 38, quantity: 2, mockup: "../../.env" },
    ]);
    expect(drafts[0]).toMatchObject({ mockup: file });
    expect(drafts[1]).not.toHaveProperty("mockup");
    const { items } = buildQuoteItems(drafts, () => null, { name: "Bia" });
    expect(items[0].mockup).toBe(file);
    expect(draftFromItem(items[0])).toMatchObject({ source: "avulso", mockup: file });
  });
});
