// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderCard } from "@/lib/photoOrders/render";

const px = (cm: number) => Math.round((cm / 2.54) * 300);
const base = { fit: "preencher", zoom: 1, x: 0.5, y: 0.5, border: 0, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0 };

async function source() {
  const dir = mkdtempSync(path.join(tmpdir(), "fare-retro-"));
  const file = path.join(dir, "foto.png");
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#ff0000" } }).png().toFile(file);
  return file;
}

describe("cartão da foto", () => {
  it("Instax deitada volta em pé para a folha", async () => {
    const card = await renderCard(await source(), { width: 1600, height: 1200 }, { ...base, sizeId: "instax", landscape: true } as never);
    expect([card.width, card.height]).toEqual([px(5.5), px(8.5)]);
    const meta = await sharp(card.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([px(5.5), px(8.5)]);
  });

  it("zoom abaixo de 100% deixa branco em volta da foto", async () => {
    const card = await renderCard(await source(), { width: 1600, height: 1200 }, { ...base, sizeId: "10x15", landscape: true, zoom: 0.5 } as never);
    const { data, info } = await sharp(card.buffer).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels + 1];
    expect(at(5, 5)).toBeGreaterThan(240); // canto: papel branco
    expect(at(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBeLessThan(20); // centro: foto vermelha
  });
});
