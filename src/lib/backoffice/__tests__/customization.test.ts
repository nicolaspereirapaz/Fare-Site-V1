import { describe, expect, it } from "vitest";
import {
  calcularDtfTextil,
  calcularDtfUv,
  calcularItemOrcamento,
  calcularLaser,
  calcularPersonalizacao,
  precoSpotParaQuantidade,
  DTF_UV_FOLHAS,
} from "@/lib/backoffice/customization";

describe("DTF Têxtil (Laraella): metro linear fracionado, 58 cm, 2 mm entre artes, mínimo 1 m", () => {
  it("arte 10×10 cm, 100 un.: 5 por linha, 20 linhas = 2,038 m → R$ 76,94 com frete", () => {
    const r = calcularDtfTextil({ larguraCm: 10, alturaCm: 10, quantidade: 100 });
    expect(r.porLinha).toBe(5);
    expect(r.linhas).toBe(20);
    expect(r.metros).toBeCloseTo(2.038, 3);
    expect(r.custoTotal).toBe(76.94); // 2,038 × 29,90 = 60,94 + 16,00
    expect(r.custoUnitario).toBe(0.77);
  });

  it("gira a arte quando cabe mais por linha", () => {
    // 30×8 em pé: 1 por linha (30 cm de largura). Deitada (8 de largura): 7 por linha.
    const r = calcularDtfTextil({ larguraCm: 30, alturaCm: 8, quantidade: 70 });
    expect(r.girada).toBe(true);
    expect(r.porLinha).toBe(7);
  });

  it("cobra no mínimo 1 metro", () => {
    const r = calcularDtfTextil({ larguraCm: 5, alturaCm: 5, quantidade: 10 });
    expect(r.metros).toBe(1);
    expect(r.custoTotal).toBe(45.9);
  });

  it("arte maior que 58 cm nos dois lados não cabe", () => {
    expect(() => calcularDtfTextil({ larguraCm: 60, alturaCm: 70, quantidade: 1 })).toThrow(/não cabe/);
  });
});

describe("DTF UV (FuturaIM): folhas 20×28 ou 28×40, 2 mm entre artes, mínimo 1 folha, frete R$ 10", () => {
  it("tabelas de preço das folhas (por faixa de quantidade)", () => {
    expect(DTF_UV_FOLHAS.map((folha) => folha.nome)).toEqual(["20×28 cm", "28×40 cm"]);
    expect(DTF_UV_FOLHAS[0].faixas[0]).toEqual({ minimo: 1, preco: 25.99 });
    expect(DTF_UV_FOLHAS[1].faixas.at(-1)).toEqual({ minimo: 50, preco: 28.7 });
  });

  it("quantas artes cabem por folha (girando quando cabe mais)", () => {
    const r = calcularDtfUv({ larguraCm: 5, alturaCm: 5, quantidade: 1 });
    expect(r.porFolha).toEqual({ "20×28 cm": 15, "28×40 cm": 35 }); // 3×5 e 5×7 (5 cm + 2 mm)
  });

  it("escolhe sempre a combinação mais barata", () => {
    // 5×5 cm, 100 un.: 7 folhas pequenas = 7 × 23,60 = 165,20 | 3 grandes = 3 × 33,00 = 99,00
    const r = calcularDtfUv({ larguraCm: 5, alturaCm: 5, quantidade: 100 });
    expect(r.folhas).toEqual([{ nome: "28×40 cm", quantidade: 3, precoUnitario: 33 }]);
    expect(r.custoTotal).toBe(109); // 99,00 + 10,00 de frete
    expect(r.custoUnitario).toBe(1.09);
  });

  it("pode misturar os dois tamanhos quando sai mais barato", () => {
    // 5×5, 50 un.: 1 grande (35) + 1 pequena (15) = 33,99 + 25,99 = 59,98 < 2 grandes (66,99) e < 4 pequenas (98,68)
    const r = calcularDtfUv({ larguraCm: 5, alturaCm: 5, quantidade: 50 });
    expect(r.folhas).toEqual([
      { nome: "20×28 cm", quantidade: 1, precoUnitario: 25.99 },
      { nome: "28×40 cm", quantidade: 1, precoUnitario: 33.99 },
    ]);
    expect(r.custoTotal).toBe(69.98);
  });

  it("compra folhas a mais quando a faixa de desconto deixa o total menor", () => {
    // 25×35 só cabe 1 por folha grande: 49 × 29,75 = 1.457,75 > 50 × 28,70 = 1.435,00
    const r = calcularDtfUv({ larguraCm: 25, alturaCm: 35, quantidade: 49 });
    expect(r.folhas).toEqual([{ nome: "28×40 cm", quantidade: 50, precoUnitario: 28.7 }]);
  });

  it("arte que só cabe na folha grande usa a grande; maior que as duas não cabe", () => {
    expect(calcularDtfUv({ larguraCm: 25, alturaCm: 35, quantidade: 2 }).folhas).toEqual([
      { nome: "28×40 cm", quantidade: 2, precoUnitario: 33.99 },
    ]);
    expect(() => calcularDtfUv({ larguraCm: 30, alturaCm: 45, quantidade: 1 })).toThrow(/não cabe/);
  });
});

describe("Laser (interno): R$ 1,00 canetas e chaveiros, R$ 2,50 demais", () => {
  it("custo por peça pela categoria", () => {
    expect(calcularLaser({ categoria: "Canetas e Lápis", quantidade: 100 })).toMatchObject({ custoUnitario: 1, custoTotal: 100 });
    expect(calcularLaser({ categoria: "Chaveiros", quantidade: 10 })).toMatchObject({ custoUnitario: 1 });
    expect(calcularLaser({ categoria: "Garrafas e Squeezes", quantidade: 10 })).toMatchObject({ custoUnitario: 2.5, custoTotal: 25 });
  });
});

describe("Spot: preço da personalização pela faixa de quantidade", () => {
  const opcao = { faixas: [{ minimo: 1, preco: 64.99 }, { minimo: 50, preco: 4.1 }, { minimo: 100, preco: 2.85 }, { minimo: 1000, preco: 2.45 }] };
  it("usa a maior faixa que a quantidade atinge", () => {
    expect(precoSpotParaQuantidade(opcao, 100)).toBe(2.85);
    expect(precoSpotParaQuantidade(opcao, 999)).toBe(2.85);
    expect(precoSpotParaQuantidade(opcao, 1000)).toBe(2.45);
    expect(precoSpotParaQuantidade(opcao, 60)).toBe(4.1);
  });
});

describe("preço final ao cliente = (custo do produto + personalização) × 2 + frete do fornecedor rateado", () => {
  it("caneta de R$ 0,82 + laser R$ 1,00, 100 un. → (0,82 + 1,00) × 2 + R$ 100 ÷ 100 = R$ 4,64/un.", () => {
    const r = calcularPersonalizacao({ custoProduto: 0.82, categoria: "Canetas e Lápis", quantidade: 100, tecnica: { tipo: "laser" } });
    expect(r.personalizacaoUnitaria).toBe(1);
    expect(r.precoUnitarioFinal).toBe(4.64);
    expect(r.totalCliente).toBe(464);
  });

  it("manual: nome e preço unitário digitados pelo vendedor", () => {
    const r = calcularPersonalizacao({
      custoProduto: 5, categoria: "Canecas, Copos e Taças", quantidade: 50,
      tecnica: { tipo: "manual", nome: "Sublimação terceirizada", custoUnitario: 3.2 },
    });
    expect(r.descricao).toBe("Sublimação terceirizada");
    expect(r.precoUnitarioFinal).toBe(18.4); // (5 + 3,20) × 2 = 16,40 + 100/50 = 2,00
  });

  it("DTF têxtil rateia o custo total (com frete da Laraella) por peça", () => {
    const r = calcularPersonalizacao({
      custoProduto: 10, categoria: "Bonés", quantidade: 100, tecnica: { tipo: "dtf-textil", larguraCm: 10, alturaCm: 10 },
    });
    expect(r.personalizacaoUnitaria).toBe(0.7694); // R$ 76,94 ÷ 100, sem arredondar antes da margem
    expect(r.precoUnitarioFinal).toBe(22.54); // (10 + 0,7694) × 2 = 21,54 + 1,00
  });

  it("sem personalização = regra atual da loja", () => {
    expect(calcularPersonalizacao({ custoProduto: 0.82, categoria: "Canetas e Lápis", quantidade: 100, tecnica: { tipo: "nenhuma" } }).precoUnitarioFinal).toBe(2.64);
  });
});

describe("item com várias gravações", () => {
  it("soma as gravações por peça: (custo + gravações) × 2 + frete rateado", async () => {
    const { calcularItemOrcamento } = await import("@/lib/backoffice/customization");
    const r = calcularItemOrcamento({
      custoProduto: 0.72, categoria: "Canetas e Lápis", quantidade: 300,
      gravacoes: [{ tecnica: { tipo: "laser" }, local: "Corpo" }, { tecnica: { tipo: "laser" }, local: "Clipe" }],
    });
    expect(r.gravacoes.map((g) => [g.descricao, g.local, g.custoUnitario])).toEqual([["Laser", "Corpo", 1], ["Laser", "Clipe", 1]]);
    expect(r.gravacoesPorPeca).toBe(2);
    expect(r.precoUnitario).toBe(5.78); // (0,72 + 2) × 2 + 100/300 = 5,7733 -> para cima
    expect(r.total).toBe(1734);
    expect(r.custoTotal).toBe(Math.round((0.72 * 300 + 600 + 100) * 100) / 100);
  });

  it("sem gravação é o preço do site (custo × 2 + frete rateado)", async () => {
    const { calcularItemOrcamento } = await import("@/lib/backoffice/customization");
    const r = calcularItemOrcamento({ custoProduto: 38, categoria: "", quantidade: 2, gravacoes: [] });
    expect(r.precoUnitario).toBe(126);
    expect(r.gravacoes).toEqual([]);
  });

  it("cada gravação é calculada na quantidade do item (DTF UV escolhe as folhas)", async () => {
    const { calcularItemOrcamento } = await import("@/lib/backoffice/customization");
    const r = calcularItemOrcamento({
      custoProduto: 9.48, categoria: "Garrafas e Squeezes", quantidade: 50,
      gravacoes: [{ tecnica: { tipo: "laser" }, local: "Frente" }, { tecnica: { tipo: "dtf-uv", larguraCm: 6, alturaCm: 6 }, local: "Verso" }],
    });
    expect(r.gravacoes[0].custoUnitario).toBe(2.5);
    expect(r.gravacoes[1]).toMatchObject({ descricao: "DTF UV 6×6 cm", local: "Verso", custoTotal: 103.97 });
    expect(r.precoUnitario).toBe(Math.ceil(((9.48 + 2.5) * 2 * 50 * 100 + 103.97 * 2 * 100 + 10000) / 50) / 100);
  });

  it("orçamento: o total nunca fica abaixo da conta exata (frete não some no arredondamento)", () => {
    const r = calcularItemOrcamento({ custoProduto: 1, categoria: "Brindes", quantidade: 300, gravacoes: [] });
    expect(r.precoUnitario).toBe(2.34); // 700 / 300 = 2,3333 -> 2,34
    expect(r.total).toBe(702);
  });

  it("gravação sem técnica válida é recusada", async () => {
    const { calcularItemOrcamento } = await import("@/lib/backoffice/customization");
    expect(() => calcularItemOrcamento({ custoProduto: 1, categoria: "", quantidade: 10, gravacoes: [{ tecnica: { tipo: "nenhuma" }, local: "" }] })).toThrow(/técnica/i);
  });
});
