// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Pastas temporárias: nunca usa a pasta real dos pedidos nem o banco da aplicação.
const root = mkdtempSync(path.join(tmpdir(), "fare-fotos-"));
vi.stubEnv("FARE_ORDERS_DIR", path.join(root, "Pedidos"));
vi.stubEnv("FARE_PHOTO_UPLOADS_DIR", path.join(root, "envios"));

const { cssFilterToAffine } = await import("@/lib/photoOrders/render");
const { createPhotoOrder, firstAndLastName, safeFolderName, PhotoOrderError } = await import("@/lib/photoOrders/finalize");
const { saveUpload, readUpload } = await import("@/lib/photoOrders/uploads");
const { listPhotoOrders } = await import("@/lib/photoOrders/repository");
const { dayFolder } = await import("@/lib/photoOrders/config");

const edits = { fit: "preencher", landscape: true, zoom: 1, x: 0.5, y: 0.5, border: 0, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0 } as const;

async function upload(name: string, width: number, height: number) {
  const jpeg = await sharp({ create: { width, height, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();
  return saveUpload(new Blob([new Uint8Array(jpeg)]).stream(), name);
}

describe("pedido de fotos", () => {
  const database = new DatabaseSync(":memory:");
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("traduz os filtros do CSS para a mesma conta de cor da prévia", () => {
    const none = cssFilterToAffine("brightness(100%) contrast(100%) saturate(100%)");
    expect(none.m).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    const gray = cssFilterToAffine("grayscale(1)");
    // preto e branco: as três cores saem iguais
    expect(gray.m[0]).toEqual(gray.m[1]);
    expect(gray.m[1]).toEqual(gray.m[2]);
    const contrast = cssFilterToAffine("contrast(1.5)");
    expect(contrast.o[0]).toBeCloseTo(-0.25);
  });

  it("monta nomes de pasta que o Windows aceita, com primeiro e último nome", () => {
    expect(firstAndLastName("Ana Maria da Silva")).toBe("Ana Silva");
    expect(firstAndLastName("  Bruno ")).toBe("Bruno");
    expect(safeFolderName('Ana: "Silva"? / Teste.')).toBe("Ana Silva Teste");
  });

  describe("montagem", () => {
    let photos: Array<{ id: string }> = [];
    beforeAll(async () => {
      photos = [await upload("praia.jpg", 1800, 1200), await upload("festa.jpg", 1800, 1200), await upload("retrato.jpg", 1200, 1800)];
    });

    it("cria a pasta do cliente, a do pedido, uma por tamanho + papel, os originais e o PED-XXXXXX.html", async () => {
      const result = await createPhotoOrder(database, { id: "cliente-1" }, {
        customer: { name: "Ana Maria Silva", phone: "(11) 98888-7777" },
        delivery: "retirada",
        photos: [
          { ...edits, uploadId: photos[0].id, sizeId: "10x15", paper: "brilho", copies: 2 },
          { ...edits, uploadId: photos[1].id, sizeId: "10x15", paper: "brilho", copies: 1 },
          { ...edits, uploadId: photos[2].id, sizeId: "20x30", paper: "fosco", copies: 1, landscape: false, border: 0.5 },
        ],
      });

      const { order } = result;
      expect(order.code).toMatch(/^PED-[0-9A-F]{6}$/);
      expect(result.customerNumber).toBe("C0001");
      // 3 cópias de 10 × 15 (R$ 3,50) + 1 ampliação 20 × 30 (R$ 11,00)
      expect(order.totalCents).toBe(2150);
      expect(order.folder).toBe(path.join(root, "Pedidos", dayFolder(), `Ana Silva - ${order.code}`));
      expect(readdirSync(order.folder).sort()).toEqual(["10x15 Brilho", "20x30 Fosco", "Originais", `${order.code}.html`]);
      expect(readdirSync(path.join(order.folder, "10x15 Brilho")).sort()).toEqual(["foto-01 (2 copias).jpg", "foto-02 (1 copia).jpg"]);
      expect(readdirSync(path.join(order.folder, "Originais"))).toHaveLength(3);
      const html = readFileSync(path.join(order.folder, `${order.code}.html`), "utf8");
      expect(html).toContain("3 cópias");
      expect(html).toContain("1 cópia<");
      expect(html).not.toContain("unidade");

      // arquivo pronto para imprimir: tamanho real da máquina (10,2 × 15,2 cm) a 300 dpi
      const print = await sharp(path.join(order.folder, "10x15 Brilho", "foto-01 (2 copias).jpg")).metadata();
      expect([print.width, print.height, print.density]).toEqual([1795, 1205, 300]);
      // os envios saem da pasta de espera depois de virar pedido
      expect(await readUpload(photos[0].id)).toBeNull();
      expect(listPhotoOrders(database)).toHaveLength(1);
      expect(decodeURIComponent(result.whatsappUrl)).toContain(`Pedido ${order.code}`);
    });

    it("o mesmo cliente mantém o número; cada pedido ganha a sua pasta no dia, com o nome informado", async () => {
      const extra = await upload("outra.jpg", 1800, 1200);
      const { order } = await createPhotoOrder(database, { id: "cliente-1" }, {
        customer: { name: "Ana Maria Silva Souza", phone: "(11) 98888-7777" },
        delivery: "entrega",
        photos: [{ ...edits, uploadId: extra.id, sizeId: "10x15", paper: "fosco", copies: 1 }],
      });
      expect(order.folder).toBe(path.join(root, "Pedidos", dayFolder(), `Ana Souza - ${order.code}`));
      expect(existsSync(path.join(order.folder, "10x15 Fosco", "foto-01 (1 copia).jpg"))).toBe(true);
    });

    it("fotos retrô: folha cinza 10,2 × 15,2 com o cartão branco; Instax junta 2 cópias por folha", async () => {
      const [polaroid, instaxA, instaxB] = [await upload("p.jpg", 1200, 1200), await upload("a.jpg", 1200, 1600), await upload("b.jpg", 1200, 1600)];
      const { order } = await createPhotoOrder(database, { id: "cliente-retro" }, {
        customer: { name: "Bia Lima", phone: "(11) 97777-6666" },
        delivery: "retirada",
        photos: [
          { ...edits, landscape: false, uploadId: polaroid.id, sizeId: "polaroid", paper: "brilho", copies: 1 },
          { ...edits, landscape: false, uploadId: instaxA.id, sizeId: "instax", paper: "brilho", copies: 1 },
          { ...edits, landscape: false, uploadId: instaxB.id, sizeId: "instax", paper: "brilho", copies: 3 },
        ],
      });
      // 1 Polaroid (R$ 8,00) + 4 Instax (R$ 3,50 cada)
      expect(order.totalCents).toBe(2200);
      expect(readdirSync(path.join(order.folder, "Polaroid 9x11 Brilho"))).toEqual(["foto-01 (1 copia).jpg"]);
      expect(readdirSync(path.join(order.folder, "Instax 5,5x8,5 Brilho")).sort()).toEqual(["folha-01 (fotos 02 e 03).jpg", "folha-02 (foto 03).jpg"]);
      expect(readdirSync(path.join(order.folder, "Originais"))).toHaveLength(3);

      const pixel = async (file: string, x: number, y: number) => {
        const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
        const at = (y * info.width + x) * info.channels;
        return [data[at], data[at + 1], data[at + 2]];
      };
      const near = (rgb: number[], target: number[]) => rgb.every((v, i) => Math.abs(v - target[i]) < 12);
      const polaroidFile = path.join(order.folder, "Polaroid 9x11 Brilho", "foto-01 (1 copia).jpg");
      const meta = await sharp(polaroidFile).metadata();
      expect([meta.width, meta.height, meta.density]).toEqual([1205, 1795, 300]);
      expect(near(await pixel(polaroidFile, 10, 10), [217, 217, 217])).toBe(true); // cinza (recortado)
      expect(near(await pixel(polaroidFile, 85, 900), [255, 255, 255])).toBe(true); // margem branca do cartão
      expect(near(await pixel(polaroidFile, 600, 1500), [255, 255, 255])).toBe(true); // faixa branca de baixo
      expect(near(await pixel(polaroidFile, 600, 750), [51, 102, 204])).toBe(true); // a foto

      const sheet2 = path.join(order.folder, "Instax 5,5x8,5 Brilho", "folha-02 (foto 03).jpg");
      const sheetMeta = await sharp(sheet2).metadata();
      expect([sheetMeta.width, sheetMeta.height]).toEqual([1795, 1205]);
      expect(near(await pixel(sheet2, 520, 500), [51, 102, 204])).toBe(true); // 1º cartão com a foto
      expect(near(await pixel(sheet2, 1210, 500), [51, 102, 204])).toBe(true); // 2º cartão com a foto
      expect(near(await pixel(sheet2, 10, 10), [217, 217, 217])).toBe(true); // cinza (recortado)
    });

    it("recusa foto que não chegou ao servidor e tamanho que não existe", async () => {
      const base = { customer: { name: "Ana", phone: "(11) 98888-7777" }, delivery: "retirada" as const };
      await expect(createPhotoOrder(database, { id: "c" }, { ...base, photos: [{ ...edits, uploadId: "00000000-0000-4000-8000-000000000000", sizeId: "10x15", paper: "brilho", copies: 1 }] }))
        .rejects.toBeInstanceOf(PhotoOrderError);
      const sent = await upload("x.jpg", 600, 400);
      await expect(createPhotoOrder(database, { id: "c" }, { ...base, photos: [{ ...edits, uploadId: sent.id, sizeId: "99x99", paper: "brilho", copies: 1 }] }))
        .rejects.toThrow("Tamanho de foto inválido.");
      // Instax: mínimo de 2 fotos e sempre par (2 cartões por folha).
      await expect(createPhotoOrder(database, { id: "c" }, { ...base, photos: [{ ...edits, uploadId: sent.id, sizeId: "instax", paper: "brilho", copies: 1 }] }))
        .rejects.toThrow("mínimo de 2 fotos");
      await expect(createPhotoOrder(database, { id: "c" }, { ...base, photos: [{ ...edits, uploadId: sent.id, sizeId: "instax", paper: "brilho", copies: 3 }] }))
        .rejects.toThrow("número par");
    });
  });
});
