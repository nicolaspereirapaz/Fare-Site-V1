import { afterEach, describe, expect, it, vi } from "vitest";

// PDF de mentira: páginas A4 (595 × 842 pt) ou A0 (2384 × 3370 pt). O desenho real é do pdf.js, no navegador.
let pageSize = { width: 595, height: 842 };
let numPages = 2;
const destroy = vi.fn(async () => {});
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy,
    promise: Promise.resolve({
      get numPages() { return numPages; },
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: pageSize.width * scale, height: pageSize.height * scale }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: () => {},
      }),
    }),
  }),
}));

const { pdfPages } = await import("@/components/fotos/shared");
const sizes: Array<[number, number]> = [];
vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done) {
  sizes.push([this.width, this.height]);
  done(new Blob(["jpg"], { type: "image/jpeg" }));
});
const pdf = (name: string) => Object.assign(new File(["%PDF"], name, { type: "application/pdf" }), { arrayBuffer: async () => new ArrayBuffer(4) });

describe("PDF na revelação", () => {
  afterEach(() => { sizes.length = 0; });

  it("cada página vira uma foto JPG em 300 dpi", async () => {
    const pages = await pdfPages(pdf("Formatura.pdf"));
    expect(pages.map((page) => [page.name, page.type])).toEqual([["Formatura - página 1.jpg", "image/jpeg"], ["Formatura - página 2.jpg", "image/jpeg"]]);
    expect(sizes[0]).toEqual([2479, 3508]);
    expect(destroy).toHaveBeenCalled();
  });

  it("página única fica com o nome do PDF; página enorme não passa de 16 MP", async () => {
    numPages = 1;
    pageSize = { width: 2384, height: 3370 };
    const pages = await pdfPages(pdf("Banner.PDF"));
    expect(pages.map((page) => page.name)).toEqual(["Banner.jpg"]);
    expect(sizes[0][0] * sizes[0][1]).toBeLessThanOrEqual(16_000_000);
  });
});
