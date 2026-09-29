import { describe, expect, it } from "vitest";
import { featuredVariantIndex, withCampaignFeaturedColor } from "@/lib/campaignColors";
import type { PublicCatalogProduct } from "@/lib/publicCatalog";

describe("cor de vitrine do Outubro Rosa", () => {
  it("prefere rosa, mesmo quando não é a primeira variação", () => {
    expect(featuredVariantIndex(["Preto", "Branco", "Rosa", "Azul"])).toBe(2);
  });

  it("prefere rosa puro a rosa combinado, e rosa principal a rosa de detalhe", () => {
    expect(featuredVariantIndex(["Branco / Rosa", "Rosa / Preto", "Rosa"])).toBe(2);
    expect(featuredVariantIndex(["Branco / Rosa", "Rosa / Preto"])).toBe(1);
    expect(featuredVariantIndex(["Azul", "Transparente / Rosa"])).toBe(1);
  });

  it("qualquer tom de rosa vence o branco", () => {
    expect(featuredVariantIndex(["Branco", "Rosa (tom 2)"])).toBe(1);
    expect(featuredVariantIndex(["Branco", "Azul / Rosa"])).toBe(1);
  });

  it("sem rosa, usa branco", () => {
    expect(featuredVariantIndex(["Preto", "Azul", "Branco"])).toBe(2);
    expect(featuredVariantIndex(["Preto", "Azul / Branco", "Branco / Preto"])).toBe(2);
  });

  it("sem rosa nem branco, mantém a primeira", () => {
    expect(featuredVariantIndex(["Preto", "Azul"])).toBe(0);
    expect(featuredVariantIndex([])).toBe(0);
  });

  it("troca a foto do card e coloca a cor escolhida em primeiro", () => {
    const product = {
      publicId: "p", name: "Caneta", description: "", imageUrl: "preto.jpg", category: "", subcategory: "", colors: [],
      variants: [
        { publicId: "a", label: "Preto", imageUrl: "preto.jpg" },
        { publicId: "b", label: "Rosa", imageUrl: "rosa.jpg" },
        { publicId: "c", label: "Branco", imageUrl: "branco.jpg" },
      ],
    } satisfies PublicCatalogProduct;
    const featured = withCampaignFeaturedColor(product);
    expect(featured.imageUrl).toBe("rosa.jpg");
    expect(featured.variants.map((variant) => variant.publicId)).toEqual(["b", "a", "c"]);
  });
});
