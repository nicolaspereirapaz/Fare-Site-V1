import { describe, expect, it } from "vitest";
import { fromServerItem, moneyInput } from "@/components/staff/quoteEditorShared";

describe("campos de dinheiro do editor (reabrir não pode mudar o preço)", () => {
  it("mostra no mínimo 2 casas e não corta as digitadas", () => {
    expect(moneyInput(1.5)).toBe("1,50");
    expect(moneyInput(2)).toBe("2,00");
    expect(moneyInput(1.234)).toBe("1,234");
    expect(moneyInput(0.1 + 0.2)).toBe("0,30");
  });

  it("orçamento salvo com custo 1,234 reabre com 1,234 (salvar de novo dá o mesmo preço)", () => {
    const item = fromServerItem({ id: "a", source: "catalogo", publicId: "p", variant: "Azul", quantity: 1000, gravacoes: [{ tecnica: { tipo: "laser" }, local: "", custoOverride: 0.125 }], costOverride: 1.234 });
    expect(item).toMatchObject({ costOverride: "1,234", gravacoes: [{ custoOverride: "0,125" }] });
  });
});
