import { afterEach, describe, expect, it, vi } from "vitest";
import { PART_BYTES, uploadBlob } from "@/components/fotos/upload";

/** XHR falso: guarda cada envio e responde como o servidor (partes → { parte }, última/inteiro → foto pronta). */
const calls: Array<{ url: string; size: number }> = [];
class FakeXhr {
  url = "";
  status = 200;
  responseText = "";
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader() {}
  send(blob: Blob) {
    calls.push({ url: this.url, size: blob.size });
    const final = !this.url.includes("inicio=") || this.url.includes("fim=1");
    this.responseText = JSON.stringify(final ? { id: "foto-1", width: 10, height: 10, convertedFrom: null } : { parte: "abc" });
    queueMicrotask(() => this.onload?.());
  }
}

describe("envio de fotos", () => {
  afterEach(() => { calls.length = 0; vi.unstubAllGlobals(); });

  it("manda arquivo pequeno de uma vez", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const sent = await uploadBlob(new Blob([new Uint8Array(10)]), "a.jpg");
    expect(sent.id).toBe("foto-1");
    expect(calls).toEqual([{ url: "/api/fotos/envios", size: 10 }]);
  });

  it("manda arquivo grande em partes, em ordem, com o id da 1ª resposta", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const size = PART_BYTES * 2 + 5;
    const big = { size, slice: (start: number, end: number) => new Blob([new Uint8Array(end - start)]) } as unknown as Blob;
    const sent = await uploadBlob(big, "grande.tif");
    expect(sent.id).toBe("foto-1");
    expect(calls).toEqual([
      { url: "/api/fotos/envios?inicio=0", size: PART_BYTES },
      { url: `/api/fotos/envios?inicio=${PART_BYTES}&parte=abc`, size: PART_BYTES },
      { url: `/api/fotos/envios?inicio=${PART_BYTES * 2}&parte=abc&fim=1`, size: 5 },
    ]);
  });
});
