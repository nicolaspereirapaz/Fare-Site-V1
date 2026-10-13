import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  hideBrokenImages,
  imageCheckDue,
  readBrokenImages,
  readImageCheckState,
  runImageCheck,
} from "@/lib/imageHealth";
import { groupAvailableProducts, type Product } from "@/lib/xbz";

const OK = { status: 200, contentType: "image/jpeg" };
const ERRO = { status: 500, contentType: "text/html" };

describe("verificação diária das fotos", () => {
  it("foto que não abre (mesmo tentando de novo) é marcada; volta ao normal quando abrir de novo", async () => {
    const database = new DatabaseSync(":memory:");
    const fetcher = vi.fn(async (url: string) => (url.includes("quebrada") ? ERRO : OK));

    const result = await runImageCheck(database, ["https://cdn/boa.jpg", "https://cdn/quebrada.jpg", "https://cdn/boa.jpg", ""], {
      fetcher, retryDelayMs: 0, now: new Date("2026-10-11T03:00:00.000Z"),
    });

    expect(result).toEqual({ checked: 2, broken: 1 });
    expect(fetcher).toHaveBeenCalledTimes(3); // a quebrada é testada 2 vezes antes de ser marcada
    expect(readBrokenImages(database)).toEqual(new Set(["https://cdn/quebrada.jpg"]));
    expect(readImageCheckState(database)).toMatchObject({ lastStartedAt: "2026-10-11T03:00:00.000Z", checked: 2, broken: 1 });

    await runImageCheck(database, ["https://cdn/quebrada.jpg"], { fetcher: async () => OK, retryDelayMs: 0 });
    expect(readBrokenImages(database).size).toBe(0);
  });

  it("falha passageira na 1ª tentativa não esconde o produto", async () => {
    const database = new DatabaseSync(":memory:");
    let calls = 0;
    await runImageCheck(database, ["https://cdn/lenta.jpg"], {
      fetcher: async () => (calls++ === 0 ? { status: 0, contentType: "" } : OK), retryDelayMs: 0,
    });
    expect(readBrokenImages(database).size).toBe(0);
  });

  it("página de erro com status 200 (HTML no lugar da imagem) conta como foto quebrada", async () => {
    const database = new DatabaseSync(":memory:");
    await runImageCheck(database, ["https://cdn/sumiu.jpg"], { fetcher: async () => ({ status: 200, contentType: "text/html; charset=utf-8" }), retryDelayMs: 0 });
    expect(readBrokenImages(database)).toEqual(new Set(["https://cdn/sumiu.jpg"]));
  });

  it("roda uma vez por dia", () => {
    const now = new Date("2026-10-12T03:00:00.000Z");
    expect(imageCheckDue(null, now)).toBe(true);
    expect(imageCheckDue("2026-10-11T05:00:00.000Z", now)).toBe(false);
    expect(imageCheckDue("2026-10-11T03:00:00.000Z", now)).toBe(true);
  });
});

describe("produtos com foto quebrada", () => {
  const base: Product = {
    id: "", sku: "", compoundCode: "", familyCode: "", name: "CANETA SEMI METAL", description: "", productUrl: "", imageUrl: "",
    category: "Canetas e Lápis", subcategory: "", primaryColor: "", secondaryColor: "", price: 1, formattedPrice: "",
    clearance: false, stockMain: 10, stockAvailable: 10, reliability: "", restockDate: "",
  };

  it("cor com foto quebrada usa a foto de outra cor; produto sem nenhuma foto boa sai da loja", () => {
    const broken = new Set(["https://cdn/azul-quebrada.jpg", "https://cdn/so-uma.jpg"]);
    const products = hideBrokenImages([
      { ...base, id: "1", familyCode: "A", primaryColor: "AZUL", imageUrl: "https://cdn/azul-quebrada.jpg" },
      { ...base, id: "2", familyCode: "A", primaryColor: "PRETO", imageUrl: "https://cdn/preto.jpg" },
      { ...base, id: "3", familyCode: "B", primaryColor: "PRATA", imageUrl: "https://cdn/so-uma.jpg" },
    ], broken);
    const grouped = groupAvailableProducts(products);

    expect(grouped.map((product) => product.internalCode)).toEqual(["A"]);
    expect(grouped[0].imageUrl).toBe("https://cdn/preto.jpg");
    expect(grouped[0].variants.map((variant) => variant.imageUrl)).toEqual(["", "https://cdn/preto.jpg"]);
  });
});
