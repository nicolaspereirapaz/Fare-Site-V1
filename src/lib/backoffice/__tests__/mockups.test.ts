// @vitest-environment node
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createManualQuote, findQuoteById } from "@/lib/quotes/repository";

const dir = mkdtempSync(path.join(tmpdir(), "mockups-"));
process.env.FARE_MOCKUPS_DIR = dir;
let createMockupHandlers: typeof import("@/lib/backoffice/mockups").createMockupHandlers;
let documentImageOf: typeof import("@/lib/proposals/catalogImages").documentImageOf;
beforeAll(async () => {
  ({ createMockupHandlers } = await import("@/lib/backoffice/mockups"));
  ({ documentImageOf } = await import("@/lib/proposals/catalogImages"));
});

const png = () => sharp({ create: { width: 40, height: 30, channels: 4, background: "#ff0000" } }).png().toBuffer();

function setup(role = "vendedor") {
  const db = new DatabaseSync(":memory:");
  const quote = createManualQuote(db, {
    ownerId: "c1", customer: { name: "Ana" }, createdBy: "Bia", internalNotes: "nota", idempotencyKey: "quote-123456",
    items: [{ id: "a", productName: "Caneta", slug: "removido", quantity: 10, unitPrice: 5, selections: {}, artworkName: null, codes: { fare: "X1", supplier: "xbz", supplierCode: "1", sku: "1" } }],
  });
  const handlers = createMockupHandlers({
    getSession: vi.fn().mockResolvedValue(role ? { user: { id: "s1", name: "Bia", role } } : null),
    database: () => db,
    productImageOf: async () => "https://cdn.xbzbrindes.com.br/caneta.jpg",
    fetchImage: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
  });
  return { db, quote, handlers };
}

async function send(handlers: ReturnType<typeof setup>["handlers"], quoteId: string, file: Blob) {
  const form = new FormData();
  form.set("kind", "quote"); form.set("id", quoteId); form.set("item", "a"); form.set("file", file, "mockup.png");
  return handlers.upload(new Request("http://x/api/backoffice/mockups", { method: "POST", body: form }));
}

describe("mockup do item", () => {
  it("só a equipe envia, vê e baixa", async () => {
    const { quote, handlers } = setup("cliente");
    expect((await send(handlers, quote.id, new Blob([await png()]))).status).toBe(403);
    expect((await handlers.productPhoto(new Request(`http://x/?kind=quote&id=${quote.id}&item=a`))).status).toBe(403);
    expect((await setup("").handlers.serve(new Request("http://x/"), "x.jpg")).status).toBe(401);
  });

  it("envia, troca e remove: vira JPG, entra no item e substitui a foto do documento", async () => {
    const { db, quote, handlers } = setup();
    const first = await send(handlers, quote.id, new Blob([await png()]));
    expect(first.status).toBe(200);
    const { mockupUrl } = await first.json();
    const saved = findQuoteById(db, quote.id)!;
    expect(saved.items[0].mockup).toMatch(/\.jpg$/);
    expect(saved.internalNotes).toBe("nota");
    expect(await documentImageOf(saved.items[0])).toBe(mockupUrl);
    const served = await handlers.serve(new Request("http://x/"), saved.items[0].mockup!);
    expect(served.headers.get("content-type")).toBe("image/jpeg");

    expect((await send(handlers, quote.id, new Blob([await png()]))).status).toBe(200);
    expect(readdirSync(dir)).toHaveLength(1); // o anterior foi apagado

    const removed = await handlers.remove(new Request("http://x/", { method: "DELETE", body: JSON.stringify({ kind: "quote", id: quote.id, item: "a" }) }));
    expect(removed.status).toBe(200);
    expect(findQuoteById(db, quote.id)!.items[0].mockup).toBeUndefined();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("recusa arquivo que não é imagem e não deixa sobra no disco", async () => {
    const { quote, handlers } = setup();
    const response = await send(handlers, quote.id, new Blob(["não é imagem"]));
    expect(response.status).toBe(400);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("baixa a foto original do produto com o nome do item", async () => {
    const { quote, handlers } = setup();
    const response = await handlers.productPhoto(new Request(`http://x/?kind=quote&id=${quote.id}&item=a`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain('filename="X1 - Caneta.jpg"');
  });

  it("imagem de item fora do catálogo: guarda o arquivo sem mexer em orçamento", async () => {
    const { db, quote, handlers } = setup();
    const form = new FormData();
    form.set("file", new Blob([await png()]), "banner.png");
    const response = await handlers.upload(new Request("http://x/api/backoffice/mockups", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    const { mockup } = await response.json();
    expect(readdirSync(dir)).toContain(mockup);
    expect(findQuoteById(db, quote.id)!.items[0].mockup).toBeUndefined();
  });
});
