// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { customSize } from "@/components/fotos/catalog";
import { renderPrint, SHEET_GREY } from "@/lib/photoOrders/render";

const px = (cm: number) => Math.round((cm / 2.54) * 300);

describe("tamanho digitado", () => {
  it("sai na folha cinza do tamanho da tabela em que cabe, com a foto no tamanho pedido no centro", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fare-custom-"));
    const source = path.join(dir, "foto.png");
    await sharp({ create: { width: 900, height: 1300, channels: 3, background: "#ff0000" } }).png().toFile(source);
    const size = customSize("revelacao", 9, 13)!; // cabe no 10 × 15 (papel real 10,2 × 15,2)
    expect(size.base?.id).toBe("10x15");
    const edits = { sizeId: size.id, fit: "preencher", landscape: false, zoom: 1, x: 0, y: 0, border: 0, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0 } as never;
    const out = path.join(dir, "saida.jpg");
    const result = await renderPrint(source, { width: 900, height: 1300 }, edits, out);
    expect(result).toEqual({ width: px(10.2), height: px(15.2) });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    const grey = Number.parseInt(SHEET_GREY.slice(1, 3), 16);
    expect(at(2, 2).every((v) => Math.abs(v - grey) < 6)).toBe(true); // canto: folha cinza
    expect(at(Math.floor(info.width / 2), Math.floor(info.height / 2))[0]).toBeGreaterThan(200); // centro: a foto
    const photoLeft = Math.floor((px(10.2) - px(9)) / 2);
    expect(at(photoLeft + 3, Math.floor(info.height / 2))[0]).toBeGreaterThan(200); // foto começa onde deve (9 cm de largura)
    expect(at(photoLeft - 4, Math.floor(info.height / 2)).every((v) => Math.abs(v - grey) < 6)).toBe(true);
  });
});
