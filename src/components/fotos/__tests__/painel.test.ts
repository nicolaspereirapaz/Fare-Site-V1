import { describe, expect, it } from "vitest";
import { customSize, deadline, groupsFor, layout, pricing, SIZES, sizeById, type Photo } from "@/components/fotos/catalog";
import { photoFromName, photoItemName } from "@/components/staff/photoItems";

const photo = (sizeId: string): Photo => ({
  id: sizeId, name: "a.jpg", url: "", w: 3000, h: 2000, sizeId, paper: "fosco", copies: 1, fit: "preencher", landscape: true,
  zoom: 1, x: 0.5, y: 0.5, border: 0.5, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0,
});

describe("painel fotográfico em madeira", () => {
  it("preço fixo por painel, pela faixa da tabela de 23/11", () => {
    expect(SIZES.filter((size) => size.group === "painel")).toHaveLength(23);
    expect(pricing("painel-20x20", 1)).toMatchObject({ unit: 100, total: 100 });
    expect(pricing("painel-30x45", 2)).toMatchObject({ unit: 133.75, total: 267.5 });
    expect(pricing("painel-50x60", 1).unit).toBe(212.5);
    expect(pricing("painel-60x150", 1).unit).toBe(527.5);
    // Mesma medida da ampliação, outro produto: ids diferentes.
    expect(sizeById("20x20").group).toBe("ampliacao");
  });

  it("painel nunca aparece junto dos tipos de foto (só pelo menu)", () => {
    expect(groupsFor("painel").map((group) => group.id)).toEqual(["painel"]);
    expect(groupsFor("revelacao").map((group) => group.id)).not.toContain("painel");
    expect(groupsFor(null).map((group) => group.id)).toEqual(["revelacao", "retro", "ampliacao", "grande"]);
  });

  it("só os tamanhos da tabela; a foto cobre a frente toda (sem borda)", () => {
    expect(customSize("painel", 33, 44)).toBeNull();
    expect(layout(photo("painel-30x40")).b).toBe(0);
  });

  it("prazo de 3 dias úteis e nome reconhecido no orçamento da equipe", () => {
    expect(deadline([{ sizeId: "painel-40x60" }])).toBe("Com painel em madeira, o pedido fica pronto em 3 dias úteis após o pagamento.");
    expect(deadline([{ sizeId: "10x15" }])).toBe("Pronto em 1 hora após o pagamento.");
    const name = photoItemName({ sizeId: "painel-40x60", paper: "fosco" });
    expect(name).toBe("Painel Fotográfico em Madeira 40 × 60 cm · papel Fosco");
    expect(photoFromName(name)).toEqual({ sizeId: "painel-40x60", paper: "fosco" });
  });
});
