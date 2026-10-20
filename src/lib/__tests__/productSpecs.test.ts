// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { fillMissingXbzSpecs, parseXbzSpecs, specLine, spotSpecs, xbzSpecs } from "@/lib/productSpecs";

// Trecho real da página da XBZ (o bloco vem repetido: computador e celular).
const block = `<p class="desc-tit">Descrição: <span class="desc-sub my-desc-sub">Espelho retangular.</span></p>
<p class='desc-tit'>Largura<span class='desc-sub'>&nbsp;:&nbsp; 6,7 cm</span></p>
<p class='desc-tit'>Medidas aproximadas para gravação<span class='desc-sub'>&nbsp;(CxL):&nbsp; 7 cm x 6 cm</span></p>
<p class='desc-tit'>Peso aproximado<span class='desc-sub'>&nbsp;(g):&nbsp; 27</span></p>`;
const expected = [
  { label: "Largura", value: "6,7 cm" },
  { label: "Área de gravação (C×L)", value: "7 cm x 6 cm" },
  { label: "Peso", value: "27 g" },
];

describe("medidas do produto", () => {
  it("XBZ: lê a página sem a descrição e sem repetir", () => {
    expect(parseXbzSpecs(block + block)).toEqual(expected);
    expect(specLine(expected[0])).toBe("Largura: 6,7 cm");
  });

  it("Spot: medidas do catálogo; roupa traz tamanhos", () => {
    expect(spotSpecs({ CombinedSizes: "55 x 22 x 12 mm" })).toEqual([{ label: "Medidas", value: "55 x 22 x 12 mm" }]);
    expect(spotSpecs({ CombinedSizes: "P, M, G", IsTextil: true })).toEqual([{ label: "Tamanhos", value: "P, M, G" }]);
    expect(spotSpecs({ CombinedSizes: "" })).toEqual([]);
    expect(spotSpecs({ CombinedSizes: "ø7 x 190 mm" })).toEqual([{ label: "Medidas", value: "diâmetro 7 x 190 mm" }]);
  });

  it("XBZ: busca uma vez e guarda; fora do ar devolve o guardado; código estranho nem busca", async () => {
    const database = new DatabaseSync(":memory:");
    const latin1 = new TextEncoder().encode(block); // só ASCII + UTF-8 válido aqui
    const fetcher = vi.fn<(url: string) => Promise<Response>>(async () => new Response(latin1));
    const now = new Date("2026-10-19T12:00:00Z");
    expect(await xbzSpecs(database, "10250", fetcher as never, now)).toEqual(expected);
    expect(await xbzSpecs(database, "10250", fetcher as never, now)).toEqual(expected);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://www.xbzbrindes.com.br/10250");

    const later = new Date("2026-12-30T12:00:00Z"); // venceu: tenta de novo, falha, fica com o guardado
    const down = vi.fn(async () => new Response("", { status: 503 }));
    expect(await xbzSpecs(database, "10250", down as never, later)).toEqual(expected);
    expect(await xbzSpecs(database, "../admin", down as never, later)).toEqual([]);
    expect(down).toHaveBeenCalledTimes(1);
  });

  it("XBZ em Latin-1: acentos certos", async () => {
    const database = new DatabaseSync(":memory:");
    const html = "<p class='desc-tit'>Diâmetro<span class='desc-sub'>&nbsp;:&nbsp; 8 cm</span></p>";
    const bytes = Uint8Array.from([...html].map((char) => char.charCodeAt(0))); // windows-1252
    expect(await xbzSpecs(database, "06520", (async () => new Response(bytes)) as never)).toEqual([{ label: "Diâmetro", value: "8 cm" }]);
  });

  it("XBZ: busca de uma vez só as que faltam; falha fica para depois", async () => {
    const database = new DatabaseSync(":memory:");
    const now = new Date("2026-10-20T12:00:00Z");
    await xbzSpecs(database, "10250", (async () => new Response(block)) as never, now);
    const fetcher = vi.fn(async (url: string) => (url.endsWith("/30000") ? new Response("", { status: 404 }) : new Response(block)));
    expect(await fillMissingXbzSpecs(database, ["10250", "20000", "20000", "30000", "BT316"], fetcher as never, now, 0)).toBe(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://www.xbzbrindes.com.br/20000", "https://www.xbzbrindes.com.br/30000"]);
    const offline = vi.fn(async () => new Response("", { status: 503 }));
    expect(await xbzSpecs(database, "20000", offline as never, now)).toEqual(expected);
    expect(offline).not.toHaveBeenCalled();
    expect(await fillMissingXbzSpecs(database, ["10250", "20000", "30000"], fetcher as never, now, 0)).toBe(1);
  });
});
