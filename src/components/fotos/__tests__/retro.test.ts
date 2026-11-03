import { describe, expect, it } from "vitest";
import { customSize, groupsFor, layout, minimumIssues, pricing, sizeById, summarize, type Photo } from "@/components/fotos/catalog";
import { photoFromName, photoItemName } from "@/components/staff/photoItems";

const photo = (sizeId: string, copies = 1): Photo => ({
  id: sizeId, name: "a.jpg", url: "", w: 1200, h: 1600, sizeId, paper: "brilho", copies, fit: "preencher", landscape: true,
  zoom: 1, x: 0.5, y: 0.5, border: 0.5, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0,
});

describe("fotos retrô", () => {
  it("preço por foto cai com a quantidade (tabelas aprovadas em 20/10)", () => {
    expect(pricing("polaroid", 1).unit).toBe(8);
    expect(pricing("polaroid", 2)).toMatchObject({ unit: 6, tier: "2 a 9 fotos", nudge: { missing: 8, unit: 5.5 } });
    expect(pricing("polaroid", 49)).toMatchObject({ unit: 4, tier: "40 a 49 fotos" });
    expect(pricing("polaroid", 50)).toMatchObject({ unit: 3.5, total: 175, tier: "50 fotos ou mais" });
    expect(pricing("instax", 2)).toMatchObject({ unit: 4, total: 8, tier: "2 fotos" });
    expect(pricing("instax", 4)).toMatchObject({ unit: 3.5, tier: "4 a 10 fotos" });
    expect(pricing("instax", 12)).toMatchObject({ unit: 3, tier: "12 a 20 fotos" });
    expect(pricing("instax", 22).unit).toBe(2.75);
    expect(pricing("instax", 42)).toMatchObject({ unit: 2.25, tier: "42 a 48 fotos" });
    expect(pricing("instax", 50)).toMatchObject({ unit: 2, total: 100 });
  });

  it("no site aparece só o cartão branco: janela do modelo e sem a borda escolhida", () => {
    const g = layout({ ...photo("polaroid"), landscape: false });
    expect([g.W, g.H, g.b]).toEqual([9, 11, 0]);
    expect(g.inset.left).toBeCloseTo(0.425);
    expect(g.inset.bottom).toBeCloseTo(11 - 0.525 - 8.15);
    const instax = layout({ ...photo("instax"), landscape: false });
    expect([instax.W, instax.H]).toEqual([5.5, 8.5]);
    expect(instax.inset.top).toBeCloseTo(0.35);
  });

  it("deitada: o cartão gira e a faixa larga vai para a direita", () => {
    const g = layout(photo("instax"));
    expect([g.W, g.H]).toEqual([8.5, 5.5]);
    expect(g.inset.left).toBeCloseTo(0.35);
    expect(g.inset.right).toBeCloseTo(8.5 - 0.35 - 6.76);
    expect(g.inset.top).toBeCloseTo(5.5 - 0.27 - 4.96);
  });

  it("zoom abaixo de 100% deixa a foto menor que a área, em Preencher e em Encaixar", () => {
    const fill = layout({ ...photo("10x15"), landscape: false, zoom: 0.5 });
    expect(fill.h).toBeCloseTo(50);
    expect(fill.top).toBeCloseTo(25);
    const fit = layout({ ...photo("10x15"), landscape: false, fit: "encaixar", zoom: 0.5, x: 0 });
    expect(fit.left).toBe(0);
    expect(fit.w).toBeCloseTo(50);
  });

  it("Instax: mínimo 2 e sempre par em cada papel (contando as cópias); Polaroid aceita 1", () => {
    expect(minimumIssues([photo("instax", 1)])).toEqual(["Instax 5,5 × 8,5: mínimo de 2 fotos."]);
    expect(minimumIssues([photo("instax", 2)])).toEqual([]);
    expect(minimumIssues([photo("instax", 3)])).toEqual(["Instax 5,5 × 8,5: escolha um número par de fotos."]);
    expect(minimumIssues([{ ...photo("instax", 1), id: "a" }, { ...photo("instax", 1), id: "b" }])).toEqual([]);
    expect(minimumIssues([photo("instax", 1), { ...photo("instax", 1), id: "b", paper: "fosco" }]))
      .toEqual(["Instax 5,5 × 8,5: escolha um número par de fotos em cada papel."]);
    expect(minimumIssues([photo("polaroid", 1), photo("polaroid", 3)])).toEqual([]);
  });

  it("entra no resumo do pedido e no orçamento da equipe pelo nome", () => {
    expect(summarize([photo("instax", 6), photo("polaroid", 1)]).total).toBe(21 + 8);
    expect(sizeById("instax").label).toBe("Instax 5,5 × 8,5 cm");
    const name = photoItemName({ sizeId: "polaroid", paper: "fosco" });
    expect(name).toBe("Foto retrô Polaroid 9 × 11 cm · papel Fosco");
    expect(photoFromName(name)).toEqual({ sizeId: "polaroid", paper: "fosco" });
    expect(photoFromName("Revelação 10 × 15 cm")).toEqual({ sizeId: "10x15" });
  });
});

describe("profissional: retrô e foto com ímã (tabela de 03/11)", () => {
  it("retrô sem ímã: preço único, sem faixa; quem não é profissional segue a tabela normal", () => {
    expect(pricing("instax", 2, true).unit).toBe(0.7);
    expect(pricing("instax", 60, true).unit).toBe(0.7);
    expect(pricing("polaroid", 1, true).unit).toBe(1.5);
    expect(pricing("polaroid", 1).unit).toBe(8);
  });

  it("foto com ímã: preço fixo, Instax R$ 4,50 o par, mínimo de 4 no 5 × 5 e 5 × 7, sem tamanho digitado", () => {
    expect(pricing("ima-5x7", 4, true).unit).toBe(1.2);
    expect(pricing("ima-25x45", 1, true).unit).toBe(29);
    expect(pricing("ima-polaroid", 1, true).unit).toBe(4.4);
    expect(pricing("ima-instax", 2, true).total).toBe(4.5);
    expect(minimumIssues([photo("ima-5x5", 3)])).toEqual(["Ímã 5 × 5: mínimo de 4 fotos."]);
    expect(minimumIssues([photo("ima-5x5", 4)])).toEqual([]);
    expect(minimumIssues([photo("ima-instax", 3)])).toEqual(["Ímã Instax 5,5 × 8,5: escolha um número par de fotos."]);
    expect(sizeById("ima-instax").frame).toBe(sizeById("instax").frame);
    expect(customSize("ima", 11, 16)).toBeNull();
  });

  it("aba Fotos com ímã só para profissional; nome vai e volta", () => {
    expect(groupsFor(false).map((group) => group.id)).not.toContain("ima");
    expect(groupsFor(true).map((group) => group.id)).toContain("ima");
    expect(photoItemName({ sizeId: "ima-10x15", paper: "fosco" })).toBe("Foto com ímã 10 × 15 cm · papel Fosco");
    expect(photoFromName("Foto com ímã 10 × 15 cm · papel Fosco")).toEqual({ sizeId: "ima-10x15", paper: "fosco" });
    expect(photoFromName("Foto com ímã Instax 5,5 × 8,5 cm")).toEqual({ sizeId: "ima-instax" });
  });
});
