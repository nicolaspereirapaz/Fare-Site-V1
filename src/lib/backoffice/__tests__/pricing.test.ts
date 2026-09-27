import { describe, expect, it } from "vitest";
import { calcularPrecoBrinde } from "../pricing";

describe("calcularPrecoBrinde", () => {
  it("aplica a regra precoUnitario=(custoProduto+gravacaoUnitaria)*2", () => {
    const resultado = calcularPrecoBrinde({
      custoProduto: 10,
      gravacaoUnitaria: 2,
      quantidade: 100,
      frete: 50,
    });

    expect(resultado.precoUnitario).toBe(24);
    expect(resultado.precoFinal).toBe(2450);
    expect(resultado.precoUnitarioFinal).toBe(24.5);
  });

  it("arredonda financeiramente em centavos para baixo quando o resto é menor que meio centavo", () => {
    const resultado = calcularPrecoBrinde({
      custoProduto: 10,
      gravacaoUnitaria: 0,
      quantidade: 3,
      frete: 0.01,
    });

    // precoUnitario = 20; precoFinal = 60.01; precoUnitarioFinal = 60.01/3 = 20.003333... -> 20.00
    expect(resultado.precoUnitario).toBe(20);
    expect(resultado.precoFinal).toBe(60.01);
    expect(resultado.precoUnitarioFinal).toBe(20);
  });

  it("arredonda financeiramente em centavos para cima quando o resto é maior ou igual a meio centavo", () => {
    const resultado = calcularPrecoBrinde({
      custoProduto: 10,
      gravacaoUnitaria: 0,
      quantidade: 3,
      frete: 0.02,
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
      frete: 0,
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
          frete: 0,
        }),
      ).toThrow();
    },
  );

  it.each([
    ["custoProduto", { custoProduto: -1, gravacaoUnitaria: 2, quantidade: 1, frete: 0 }],
    ["gravacaoUnitaria", { custoProduto: 10, gravacaoUnitaria: -2, quantidade: 1, frete: 0 }],
    ["frete", { custoProduto: 10, gravacaoUnitaria: 2, quantidade: 1, frete: -5 }],
  ] as const)("rejeita %s negativo", (_campo, input) => {
    expect(() => calcularPrecoBrinde(input)).toThrow();
  });
});
