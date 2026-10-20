// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sniff } from "@/lib/photoOrders/uploads";

const dir = mkdtempSync(path.join(tmpdir(), "sniff-"));
const file = (name: string, bytes: Buffer | string) => {
  const target = path.join(dir, name);
  writeFileSync(target, bytes);
  return target;
};

describe("envio de fotos: só formatos de imagem chegam ao ffmpeg", () => {
  it("aceita JPG, PNG e os formatos de foto que o ffmpeg converte", async () => {
    expect(await sniff(file("a.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])))).toBe("jpeg");
    expect(await sniff(file("a.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])))).toBe("png");
    expect(await sniff(file("a.heic", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic")])))).toBe("other");
    expect(await sniff(file("a.webp", Buffer.from("RIFF\0\0\0\0WEBP")))).toBe("other");
  });

  it("recusa playlist e outros arquivos que fariam o ffmpeg ler arquivos do servidor", async () => {
    expect(await sniff(file("a.m3u8", "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\nfile:///C:/Windows/win.ini\n"))).toBe("unknown");
    expect(await sniff(file("a.txt", "ffconcat version 1.0\nfile 'C:/segredo.txt'\n"))).toBe("unknown");
    expect(await sniff(file("a.mp4", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom")])))).toBe("unknown");
  });
});
