import { describe, expect, it } from "vitest";
import { calcularPrecoBrinde } from "../pricing";

describe("calcularPrecoBrinde", () => {
  it("dilui o frete do fornecedor no preço unitário final e discrimina a entrega ao cliente", () => {
    const resultado = calcularPrecoBrinde({
      custoProduto: 10,
      gravacaoUnitaria: 2,
      quantidade: 100,
      freteFornecedor: 50,
      freteCliente: 35,
    });

    expect(resultado.precoUnitario).toBe(24);
    expect(resultado.subtotalProdutos).toBe(2400);
    expect(resultado.precoFinal).toBe(2450);
    expect(resultado.precoUnitarioFinal).toBe(24.5);
    expect(resultado.freteCliente).toBe(35);
    expect(resultado.totalGeral).toBe(2485);
  });

  it("arredonda o unitário SEMPRE para cima (o frete nunca some no arredondamento)", () => {
    const resultado = calcularPrecoBrinde({
      custoProduto: 10,
      gravacaoUnitaria: 0,
      quantidade: 3,
      freteFornecedor: 0.01,
      freteCliente: 0,
    });

    // precoFinal = 60.01; 60.01/3 = 20.003333... -> 20.01 (para cima)
    expect(resultado.precoUnitario).toBe(20);
    expect(resultado.precoFinal).toBe(60.01);
    expect(resultado.precoUnitarioFinal).toBe(20.01);
  });

  it("divisão exata não sobe nada; resto acima de meio centavo também vai para cima", () => {
    expect(calcularPrecoBrinde({ custoProduto: 1, gravacaoUnitaria: 0, quantidade: 100, freteFornecedor: 100, freteCliente: 0 }).precoUnitarioFinal).toBe(3);
    // custo 1 × 300 + 100: 700/300 = 2,3333 -> 2,34 (total 702 ≥ 700)
    expect(calcularPrecoBrinde({ custoProduto: 1, gravacaoUnitaria: 0, quantidade: 300, freteFornecedor: 100, freteCliente: 0 }).precoUnitarioFinal).toBe(2.34);
    const resultado = calcularPrecoBrinde({
      custoProduto: 10,
      gravacaoUnitaria: 0,
      quantidade: 3,
      freteFornecedor: 0.02,
      freteCliente: 0,
    });

    // precoFinal = 60.02; precoUnitarioFinal = 60.02/3 = 20.006666... -> 20.01
    expect(resultado.precoFinal).toBe(60.02);
    expect(resultado.precoUnitarioFinal).toBe(20.01);
  });

  it("evita erros de ponto flutuante ao somar valores quebrados", () => {
    const resultado = calcularPrecoBrinde({
      custoProduto: 0.1,
      gravacaoUnitaria: 0.2,
      quantidade: 1,
      freteFornecedor: 0,
      freteCliente: 0,
    });

    expect(resultado.precoUnitario).toBe(0.6);
    expect(resultado.precoFinal).toBe(0.6);
    expect(resultado.precoUnitarioFinal).toBe(0.6);
  });

  it.each([0, -1, 1.5, 2.1])(
    "rejeita quantidade inválida: %s",
    (quantidade) => {
      expect(() =>
        calcularPrecoBrinde({
          custoProduto: 10,
          gravacaoUnitaria: 2,
          quantidade,
          freteFornecedor: 0,
          freteCliente: 0,
        }),
      ).toThrow();
    },
  );

  it.each([
    [
      "custoProduto",
      { custoProduto: -1, gravacaoUnitaria: 2, quantidade: 1, freteFornecedor: 0, freteCliente: 0 },
    ],
    [
      "gravacaoUnitaria",
      { custoProduto: 10, gravacaoUnitaria: -2, quantidade: 1, freteFornecedor: 0, freteCliente: 0 },
    ],
    [
      "freteFornecedor",
      { custoProduto: 10, gravacaoUnitaria: 2, quantidade: 1, freteFornecedor: -5, freteCliente: 0 },
    ],
    [
      "freteCliente",
      { custoProduto: 10, gravacaoUnitaria: 2, quantidade: 1, freteFornecedor: 0, freteCliente: -5 },
    ],
  ] as const)("rejeita %s negativo", (_campo, input) => {
    expect(() => calcularPrecoBrinde(input)).toThrow();
  });
});
