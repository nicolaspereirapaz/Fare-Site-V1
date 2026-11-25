import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// MEDIA_DIR é lido ao importar: pasta temporária antes do import.
const dir = mkdtempSync(path.join(os.tmpdir(), "fare-partes-"));
process.env.FARE_ATENDIMENTO_MEDIA_DIR = dir;
process.env.FARE_FULL_SITE = "1"; // fora do modo campanha (o atendimento fica fechado nele)
const { appendMediaPart, mediaPartPath, mediaPath } = await import("@/lib/atendimento/media");
const { readBrowserUpload } = await import("@/lib/atendimento/upload");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const stream = (text: string) => new Response(text).body!;

describe("arquivo grande em partes (Cloudflare recusa acima de 100 MB)", () => {
  it("junta as partes em ordem e a requisição final (x-parte, sem corpo) vira a mídia", async () => {
    const id = "11111111-2222-3333-4444-555555555555";
    await appendMediaPart(id, 0, stream("abc"));
    await expect(appendMediaPart(id, 0, stream("abc"))).rejects.toThrow("fora de ordem");
    await appendMediaPart(id, 3, stream("def"));
    const request = new Request("https://local/x", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("DTFS OK.pdf"), "x-parte": id },
    });
    const { media } = await readBrowserUpload(request, "conversa1");
    expect(media).toMatchObject({ name: "DTFS OK.pdf", size: 6, kind: "documento" });
    expect(readFileSync(mediaPath(media.file), "utf8")).toBe("abcdef");
    expect(existsSync(mediaPartPath(id))).toBe(false);
  });

  it("recusa id de parte que não é UUID (sem sair da pasta)", async () => {
    await expect(appendMediaPart("../../etc/passwd", 0, stream("x"))).rejects.toThrow("Envio inválido");
    const request = new Request("https://local/x", { method: "POST", headers: { "content-type": "application/pdf", "x-parte": "../x" } });
    await expect(readBrowserUpload(request, "conversa1")).rejects.toThrow("Envio inválido");
  });
});
