// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { QuoteCartItem } from "@/lib/commerce";

// Pastas temporárias: nunca usa a pasta real dos pedidos nem o banco da aplicação.
const root = mkdtempSync(path.join(tmpdir(), "fare-link-"));
vi.stubEnv("FARE_ORDERS_DIR", path.join(root, "Pedidos"));
vi.stubEnv("FARE_PHOTO_UPLOADS_DIR", path.join(root, "envios"));

const { createPhotoLink, photoLinkView, submitPhotoLink } = await import("@/lib/photoLinks/links");
const { saveUpload } = await import("@/lib/photoOrders/uploads");
const { createManualQuote, findQuoteById } = await import("@/lib/quotes/repository");
const { createOrder, findOrderById } = await import("@/lib/orders/repository");
const { dayFolder } = await import("@/lib/photoOrders/config");
const { orderCode } = await import("@/lib/orders/orderCode");

const edits = { fit: "preencher", landscape: true, zoom: 1, x: 0.5, y: 0.5, border: 0, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0 } as const;
const upload = async () => {
  const jpeg = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "#cc6633" } }).jpeg().toBuffer();
  return (await saveUpload(new Blob([new Uint8Array(jpeg)]).stream(), "foto.jpg")).id;
};
const item = (id: string, productName: string, quantity: number, unitPrice: number): QuoteCartItem => ({
  id, productName, slug: `avulso:${id}`, quantity, selections: {}, artworkName: null, unitPrice,
});
const customer = { name: "Bruna Costa Lima", phone: "(11) 97777-6666" };

describe("link das fotos", () => {
  const database = new DatabaseSync(":memory:");
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("orçamento com brindes e fotos: cliente muda quantidades e papel; brindes ficam, preço combinado vale, tamanho novo segue a tabela", async () => {
    const quote = createManualQuote(database, {
      ownerId: "cliente-b", customer, createdBy: "Equipe", internalNotes: "obs", idempotencyKey: "q1",
      items: [item("caneca", "Caneca personalizada", 50, 20), item("f1", "Revelação 10 × 15 cm", 30, 2)], // 2,00 = preço combinado (tabela: 3,00)
    });
    const token = createPhotoLink(database, "quote", quote.id, "Equipe");
    expect(createPhotoLink(database, "quote", quote.id, "Equipe")).toBe(token);

    const view = photoLinkView(database, token)!;
    expect(view).toMatchObject({ code: expect.stringMatching(/^ORC-/), kindLabel: "orçamento", editable: true, photos: [{ sizeId: "10x15", quantity: 30 }], special: { "10x15": 2 } });
    expect(view.others).toEqual([expect.objectContaining({ name: "Caneca personalizada", quantity: 50, unitPrice: 20 })]);

    const [a, b, c] = [await upload(), await upload(), await upload()];
    await submitPhotoLink(database, token, [
      { ...edits, uploadId: a, sizeId: "10x15", paper: "fosco", copies: 40 },
      { ...edits, uploadId: b, sizeId: "10x15", paper: "brilho", copies: 5 },
      { ...edits, uploadId: c, sizeId: "20x30", paper: "brilho", copies: 2 },
    ]);

    const saved = findQuoteById(database, quote.id)!;
    const byName = Object.fromEntries(saved.items.map((entry) => [entry.productName, entry]));
    expect(byName["Caneca personalizada"]).toMatchObject({ quantity: 50, unitPrice: 20 });
    expect(byName["Revelação 10 × 15 cm · papel Fosco"]).toMatchObject({ quantity: 40, unitPrice: 2, selections: { Papel: "Fosco", Fotos: "1 foto" } });
    expect(byName["Revelação 10 × 15 cm · papel Brilho"]).toMatchObject({ quantity: 5, unitPrice: 2 });
    expect(byName["Ampliação 20 × 30 cm · papel Brilho"]).toMatchObject({ quantity: 2, unitPrice: 11 });
    expect(byName["Revelação 10 × 15 cm"]).toBeUndefined();
    // 50 × 20 + 45 × 2 + 2 × 11
    expect(saved.totalCents).toBe(111200);
    expect(saved.internalNotes).toBe("obs");

    const folder = path.join(root, "Pedidos", dayFolder(), `Bruna Lima - ${view.code}`);
    expect(readdirSync(folder).sort()).toEqual(["10x15 Brilho", "10x15 Fosco", "20x30 Brilho", `${view.code}.html`, "Originais"].sort());
    expect(photoLinkView(database, token)).toMatchObject({ editable: false, submittedAt: expect.any(String) });
    await expect(submitPhotoLink(database, token, [{ ...edits, uploadId: await upload(), sizeId: "10x15", paper: "brilho", copies: 1 }])).rejects.toThrow(/já foram enviadas/);
    // Depois do envio, a equipe gera outro link (as fotos novas vão para outra pasta do mesmo documento).
    expect(createPhotoLink(database, "quote", quote.id, "Equipe")).not.toBe(token);
  });

  it("papel escolhido pela equipe vai para o link (o cliente pode trocar)", () => {
    const quote = createManualQuote(database, {
      ownerId: "cliente-p", customer, createdBy: "Equipe", internalNotes: "", idempotencyKey: "q-papel",
      items: [item("f1", "Revelação 10 × 15 cm · papel Fosco", 10, 3), item("f2", "Ampliação 20 × 30 cm", 2, 11)],
    });
    const view = photoLinkView(database, createPhotoLink(database, "quote", quote.id, "Equipe"))!;
    expect(view.photos).toEqual([{ sizeId: "10x15", quantity: 10, paper: "fosco" }, { sizeId: "20x30", quantity: 2 }]);
  });

  it("pedido: troca as linhas de foto e recalcula o total; link inválido não abre", async () => {
    const order = createOrder(database, {
      userId: "cliente-c", idempotencyKey: "o1", customer: { name: "Caio Reis", phone: "(11) 96666-5555" }, paymentMethod: "pix",
      items: [item("f", "Ampliação 20 × 30 cm", 3, 11)],
    });
    const token = createPhotoLink(database, "order", order.id, "Equipe");
    expect(photoLinkView(database, token)).toMatchObject({ kindLabel: "pedido", special: {} });
    await submitPhotoLink(database, token, [{ ...edits, uploadId: await upload(), sizeId: "20x30", paper: "fosco", copies: 12 }]);
    const saved = findOrderById(database, order.id)!;
    expect(saved.items).toEqual([expect.objectContaining({ productName: "Ampliação 20 × 30 cm · papel Fosco", quantity: 12, unitPrice: 10 })]);
    expect(saved.totalCents).toBe(12000);
    expect(existsSync(path.join(root, "Pedidos", dayFolder(), `Caio Reis - ${orderCode(order.id)}`))).toBe(true);
    expect(photoLinkView(database, "nao-existe-este-link-aqui-123")).toBeNull();
  });
});
