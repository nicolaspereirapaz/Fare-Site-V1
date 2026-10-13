import { describe, expect, it } from "vitest";
import { applyDiscount, discountLabel, parseDiscount } from "@/lib/quotes/discount";

describe("desconto no total do orçamento", () => {
  it("por porcentagem: arredonda o desconto para baixo no centavo (a loja nunca dá mais que o combinado)", () => {
    expect(applyDiscount(240000, { type: "percent", value: 10 })).toEqual({ subtotalCents: 240000, discountCents: 24000, totalCents: 216000 });
    // 7,5% de R$ 1.734,00 = 130,05
    expect(applyDiscount(173400, { type: "percent", value: 7.5 })).toEqual({ subtotalCents: 173400, discountCents: 13005, totalCents: 160395 });
    // 3% de R$ 0,99 = 0,0297 -> 0,02
    expect(applyDiscount(99, { type: "percent", value: 3 }).discountCents).toBe(2);
  });

  it("por valor: desconta o valor em reais", () => {
    expect(applyDiscount(240000, { type: "value", value: 150 })).toEqual({ subtotalCents: 240000, discountCents: 15000, totalCents: 225000 });
  });

  it("sem desconto, o total é o subtotal", () => {
    expect(applyDiscount(240000, null)).toEqual({ subtotalCents: 240000, discountCents: 0, totalCents: 240000 });
  });

  it("valor do desconto não pode passar do subtotal", () => {
    expect(() => applyDiscount(10000, { type: "value", value: 100.01 })).toThrow("O desconto não pode ser maior que o subtotal.");
    expect(applyDiscount(10000, { type: "value", value: 100 }).totalCents).toBe(0);
  });

  it("lê o que vem do navegador: vírgula, vazio, zero e valores inválidos", () => {
    expect(parseDiscount({ type: "percent", value: "7,5" })).toEqual({ type: "percent", value: 7.5 });
    expect(parseDiscount({ type: "value", value: "1.250,50" })).toEqual({ type: "value", value: 1250.5 });
    expect(parseDiscount({ type: "value", value: 150 })).toEqual({ type: "value", value: 150 });
    expect(parseDiscount(null)).toBeNull();
    expect(parseDiscount({ type: "percent", value: "" })).toBeNull();
    expect(parseDiscount({ type: "percent", value: 0 })).toBeNull();
    expect(() => parseDiscount({ type: "percent", value: 101 })).toThrow("Desconto em porcentagem vai de 0 a 100%.");
    expect(() => parseDiscount({ type: "percent", value: -5 })).toThrow();
    expect(() => parseDiscount({ type: "value", value: "abc" })).toThrow("Desconto inválido.");
    expect(() => parseDiscount({ type: "outro", value: 5 })).toThrow("Desconto inválido.");
    // Centavos a mais são cortados no valor (R$ 10,005 -> R$ 10,00).
    expect(parseDiscount({ type: "value", value: 10.005 })).toEqual({ type: "value", value: 10 });
  });

  it("rótulo para o cliente e para a equipe", () => {
    expect(discountLabel({ type: "percent", value: 7.5 })).toBe("Desconto (7,5%)");
    expect(discountLabel({ type: "percent", value: 10 })).toBe("Desconto (10%)");
    expect(discountLabel({ type: "value", value: 150 })).toBe("Desconto");
  });
});
