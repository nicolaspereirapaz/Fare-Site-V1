// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { QuoteCartItem } from "@/lib/commerce";

// Pastas temporárias: nunca usa a pasta real dos pedidos nem o banco da aplicação.
const root = mkdtempSync(path.join(tmpdir(), "fare-link-edit-"));
vi.stubEnv("FARE_ORDERS_DIR", path.join(root, "Pedidos"));
vi.stubEnv("FARE_PHOTO_UPLOADS_DIR", path.join(root, "envios"));

const { createPhotoLink, photoLinkView, reopenPhotoLink, submitPhotoLink } = await import("@/lib/photoLinks/links");
const { assemblePhotoFolder, createPhotoOrder, readPhotos, validatePhotos } = await import("@/lib/photoOrders/finalize");
const { readUpload, saveUpload } = await import("@/lib/photoOrders/uploads");
const { getPhotoOrder } = await import("@/lib/photoOrders/repository");
const { createManualQuote, findQuoteById } = await import("@/lib/quotes/repository");
const { createOrder, findOrderById } = await import("@/lib/orders/repository");
const { closeSiteOrder } = await import("@/lib/orders/payments");

const edits = { fit: "preencher", landscape: true, zoom: 1, x: 0.5, y: 0.5, border: 0, filter: "original", filterStrength: 100, brightness: 0, contrast: 0, saturation: 0 } as const;
const upload = async (name = "foto.jpg", color = "#cc6633") => {
  const jpeg = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: color } }).jpeg().toBuffer();
  return (await saveUpload(new Blob([new Uint8Array(jpeg)]).stream(), name)).id;
};
const item = (id: string, productName: string, quantity: number, unitPrice: number): QuoteCartItem => ({
  id, productName, slug: `avulso:${id}`, quantity, selections: {}, artworkName: null, unitPrice,
});
const customer = { name: "Bruna Costa Lima", phone: "(11) 97777-6666" };
const photoRows = (database: DatabaseSync) => database.prepare("SELECT id, code, folder FROM fare_photo_orders").all() as Array<{ id: string; code: string; folder: string }>;
const linkRow = (database: DatabaseSync, token: string) => database.prepare("SELECT submitted_at, photo_order_id FROM fare_photo_links WHERE token = ?").get(token) as { submitted_at: string | null; photo_order_id: string | null };
const setOrderStatus = (database: DatabaseSync, id: string, status: string) => database.prepare("UPDATE fare_orders SET status = ? WHERE id = ?").run(status, id);

describe("link das fotos: alterar depois de enviar", () => {
  const database = new DatabaseSync(":memory:");
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reabre com as fotos e os ajustes enviados; o reenvio substitui pasta, registro, linhas e total", async () => {
    const quote = createManualQuote(database, {
      ownerId: "cliente-e", customer, createdBy: "Equipe", internalNotes: "", idempotencyKey: "q-edit",
      items: [item("caneca", "Caneca personalizada", 10, 20), item("f1", "Revelação 10 × 15 cm", 30, 2)],
    });
    const token = createPhotoLink(database, "quote", quote.id, "Equipe");
    const [a, b] = [await upload("praia.jpg"), await upload("festa.jpg", "#3366cc")];
    const first = await submitPhotoLink(database, token, [
      { ...edits, uploadId: a, sizeId: "10x15", paper: "fosco", copies: 20, zoom: 1.6, x: 0.3, y: 0.7, filter: "pb", brightness: 12, border: 0.3 },
      { ...edits, uploadId: b, sizeId: "20x30", paper: "brilho", copies: 2, landscape: false, fit: "encaixar" },
    ]);
    expect(first.replaced).toBe(false);
    const folder = first.photoOrder.folder;
    // O documento tem uma pasta própria do orçamento (arquivo da equipe): o reenvio não pode mexer nele.
    writeFileSync(path.join(folder, "Orçamento da equipe.html"), "doc");

    // Depois do envio o link continua o mesmo e continua editável (orçamento aberto).
    expect(createPhotoLink(database, "quote", quote.id, "Equipe")).toBe(token);
    const view = photoLinkView(database, token)!;
    expect(view).toMatchObject({ editable: true, submittedAt: expect.any(String), previous: { id: first.photoOrder.id, photos: 2, copies: 22 } });

    const reopened = await reopenPhotoLink(database, token);
    expect(reopened).toMatchObject({ missing: 0, restoredEdits: true });
    expect(reopened.photos).toEqual([
      expect.objectContaining({ name: "praia.jpg", width: 1800, height: 1200, sizeId: "10x15", paper: "fosco", copies: 20, zoom: 1.6, x: 0.3, y: 0.7, filter: "pb", brightness: 12, border: 0.3, landscape: true }),
      expect.objectContaining({ name: "festa.jpg", sizeId: "20x30", paper: "brilho", copies: 2, fit: "encaixar", landscape: false, zoom: 1, filter: "original" }),
    ]);
    // Cada foto reaberta é um envio novo (os temporários do 1º envio já tinham sido apagados).
    expect(await readUpload(a)).toBeNull();
    for (const photo of reopened.photos) expect(await readUpload(photo.uploadId)).not.toBeNull();

    // Cliente tira a 2ª foto, muda papel/quantidade da 1ª e acrescenta uma nova em 15×21.
    const c = await upload("nova.jpg", "#22aa55");
    const keep = reopened.photos[0];
    const second = await submitPhotoLink(database, token, [
      { ...keep, paper: "brilho", copies: 35 },
      { ...edits, uploadId: c, sizeId: "15x21", paper: "fosco", copies: 3 },
    ]);
    expect(second.replaced).toBe(true);

    // Mesma pasta e mesmo código; só um registro de fotos (o anterior saiu) e o link aponta para o novo.
    expect(second.photoOrder.folder).toBe(folder);
    expect(second.photoOrder.code).toBe(first.photoOrder.code);
    expect(photoRows(database).filter((row) => row.code === first.photoOrder.code)).toEqual([{ id: second.photoOrder.id, code: first.photoOrder.code, folder }]);
    expect(getPhotoOrder(database, first.photoOrder.id)).toBeNull();
    expect(linkRow(database, token).photo_order_id).toBe(second.photoOrder.id);
    expect(readdirSync(folder).sort()).toEqual(["10x15 Brilho", "15x21 Fosco", "Originais", "Orçamento da equipe.html", `${first.photoOrder.code}.html`].sort());
    expect(readdirSync(path.join(folder, "Originais")).sort()).toEqual(["foto-01 - praia.jpg", "foto-02 - nova.jpg"]);
    expect(readdirSync(path.join(folder, "10x15 Brilho"))).toEqual(["foto-01 (35 copias).jpg"]);

    // Linhas de foto do orçamento trocadas; brinde fica; total recalculado (10 × 20 + 35 × 2 combinado + 3 × tabela 15×21).
    const saved = findQuoteById(database, quote.id)!;
    const byName = Object.fromEntries(saved.items.map((entry) => [entry.productName, entry]));
    expect(Object.keys(byName).sort()).toEqual(["Caneca personalizada", "Revelação 10 × 15 cm · papel Brilho", "Revelação 15 × 21 cm · papel Fosco"].sort());
    expect(byName["Revelação 10 × 15 cm · papel Brilho"]).toMatchObject({ quantity: 35, unitPrice: 2 });
    const unit15 = byName["Revelação 15 × 21 cm · papel Fosco"].unitPrice!;
    expect(saved.totalCents).toBe(Math.round((10 * 20 + 35 * 2 + 3 * unit15) * 100));

    // Reabrir de novo traz o envio novo (com a foto nova e sem a que saiu).
    const again = await reopenPhotoLink(database, token);
    expect(again.photos.map((photo) => [photo.name, photo.sizeId, photo.paper, photo.copies])).toEqual([["praia.jpg", "10x15", "brilho", 35], ["nova.jpg", "15x21", "fosco", 3]]);
    expect(again.photos[0]).toMatchObject({ zoom: 1.6, filter: "pb" });
  });

  it("falha no meio do reenvio deixa a pasta e o registro anteriores intactos", async () => {
    const order = createOrder(database, {
      userId: "cliente-f", idempotencyKey: "o-falha", customer: { name: "Caio Reis", phone: "(11) 96666-5555" }, paymentMethod: "pix",
      items: [item("f", "Ampliação 20 × 30 cm", 3, 11)],
    });
    const token = createPhotoLink(database, "order", order.id, "Equipe");
    const first = await submitPhotoLink(database, token, [{ ...edits, uploadId: await upload(), sizeId: "20x30", paper: "fosco", copies: 3 }]);
    const folder = first.photoOrder.folder;
    const before = readdirSync(folder).sort();
    const itemsBefore = findOrderById(database, order.id)!.items;

    // 1) Já existe na pasta algo com o nome de uma pasta nova (não é do envio anterior): recusa sem apagar nada.
    mkdirSync(path.join(folder, "10x15 Brilho"));
    writeFileSync(path.join(folder, "10x15 Brilho", "da equipe.txt"), "x");
    const reopened = await reopenPhotoLink(database, token);
    await expect(submitPhotoLink(database, token, [{ ...reopened.photos[0], sizeId: "10x15", paper: "brilho", copies: 5 }])).rejects.toThrow(/Já existe/);
    expect(readdirSync(folder).sort()).toEqual([...before, "10x15 Brilho"].sort());
    expect(readdirSync(path.join(folder, "20x30 Fosco"))).toEqual(["foto-01 (3 copias).jpg"]);
    expect(getPhotoOrder(database, first.photoOrder.id)).not.toBeNull();
    expect(findOrderById(database, order.id)!.items).toEqual(itemsBefore);
    // O envio do cliente continua no servidor (pode tentar de novo).
    expect(await readUpload(reopened.photos[0].uploadId)).not.toBeNull();
    rmSync(path.join(folder, "10x15 Brilho"), { recursive: true });

    // 2) Erro ao gravar no banco depois da troca de pastas: as fotos anteriores voltam e o registro também.
    const photos = validatePhotos([{ ...reopened.photos[0], sizeId: "10x15", paper: "brilho", copies: 5 }]);
    const { uploads, summary } = await readPhotos(photos);
    const previous = getPhotoOrder(database, first.photoOrder.id)!;
    await expect(assemblePhotoFolder(database, {
      id: "00000000-0000-4000-8000-000000000001", orderId: order.id, code: previous.code, userId: order.userId, customer: previous.customer,
      delivery: "retirada", photos, uploads, summary, replacing: previous, commit: () => { throw new Error("banco ocupado"); },
    })).rejects.toThrow("banco ocupado");
    expect(readdirSync(folder).sort()).toEqual(before);
    expect(readdirSync(path.join(folder, "20x30 Fosco"))).toEqual(["foto-01 (3 copias).jpg"]);
    expect(getPhotoOrder(database, first.photoOrder.id)).not.toBeNull();
    expect(linkRow(database, token).photo_order_id).toBe(first.photoOrder.id);
  });

  it("pedido: altera até Criando arte; em Aguardando produção trava (ver, reabrir e enviar)", async () => {
    const order = createOrder(database, {
      userId: "cliente-g", idempotencyKey: "o-trava", customer: { name: "Davi Souza", phone: "(11) 95555-4444" }, paymentMethod: "pix",
      items: [item("f", "Revelação 10 × 15 cm", 10, 3)],
    });
    const token = createPhotoLink(database, "order", order.id, "Equipe");
    await submitPhotoLink(database, token, [{ ...edits, uploadId: await upload(), sizeId: "10x15", paper: "brilho", copies: 10 }]);
    for (const status of ["aguardando_arte", "criando_arte"]) {
      setOrderStatus(database, order.id, status);
      expect(photoLinkView(database, token)!.editable).toBe(true);
    }
    const reopened = await reopenPhotoLink(database, token);
    setOrderStatus(database, order.id, "aguardando_producao");
    expect(photoLinkView(database, token)).toMatchObject({ editable: false, submittedAt: expect.any(String) });
    await expect(reopenPhotoLink(database, token)).rejects.toThrow(/entrou em produção/);
    await expect(submitPhotoLink(database, token, [{ ...reopened.photos[0], copies: 12 }])).rejects.toThrow(/entrou em produção/);
    setOrderStatus(database, order.id, "em_producao");
    expect(photoLinkView(database, token)!.editable).toBe(false);
  });

  it("reenvio não deixa o pedido ficar abaixo do que já foi pago", async () => {
    const order = createOrder(database, {
      userId: "cliente-h", idempotencyKey: "o-pago", customer: { name: "Eva Prado", phone: "(11) 94444-3333" }, paymentMethod: "pix",
      items: [item("f", "Ampliação 20 × 30 cm", 2, 11)],
    });
    const token = createPhotoLink(database, "order", order.id, "Equipe");
    await submitPhotoLink(database, token, [{ ...edits, uploadId: await upload(), sizeId: "20x30", paper: "brilho", copies: 10 }]);
    const current = findOrderById(database, order.id)!;
    expect(current.totalCents).toBe(11000); // 10 × 11,00
    closeSiteOrder(database, {
      orderId: order.id, expectedUpdatedAt: current.updatedAt, actorId: "equipe", actorName: "Equipe", paymentMethod: "pix", paymentOnPickup: false,
      payment: { amountCents: 6000, paidAt: "2026-11-06" }, deliveryMode: "retirada", deliveryDate: null, deliveryTime: null,
      deliveryAddress: null, installments: null, dueDate: null,
    });
    const reopened = await reopenPhotoLink(database, token);
    // 4 × 11,00 = 44,00 < 60,00 pagos: recusa e nada muda.
    await expect(submitPhotoLink(database, token, [{ ...reopened.photos[0], copies: 4 }])).rejects.toThrow(/menor que o valor já pago/);
    expect(findOrderById(database, order.id)!.totalCents).toBe(11000);
    const ok = await submitPhotoLink(database, token, [{ ...reopened.photos[0], copies: 6 }]);
    expect(ok.totalCents).toBe(6600); // 6 × 11,00 ≥ 60,00 pagos
  });

  it("envio antigo (sem ajustes guardados) reabre com tamanho, papel e cópias e o corte padrão; caminho estranho é ignorado", async () => {
    const quote = createManualQuote(database, {
      ownerId: "cliente-i", customer, createdBy: "Equipe", internalNotes: "", idempotencyKey: "q-antigo", items: [item("f1", "Revelação 10 × 15 cm", 5, 3)],
    });
    const token = createPhotoLink(database, "quote", quote.id, "Equipe");
    const sent = await submitPhotoLink(database, token, [
      { ...edits, uploadId: await upload("um.jpg"), sizeId: "10x15", paper: "fosco", copies: 4, zoom: 2 },
      { ...edits, uploadId: await upload("dois.jpg"), sizeId: "20x30", paper: "brilho", copies: 1 },
    ]);
    database.prepare("UPDATE fare_photo_orders SET photos_json = NULL WHERE id = ?").run(sent.photoOrder.id);
    const legacy = await reopenPhotoLink(database, token);
    expect(legacy.restoredEdits).toBe(false);
    expect(legacy.photos.map((photo) => [photo.name, photo.sizeId, photo.paper, photo.copies, photo.zoom, photo.x, photo.filter])).toEqual([
      ["um.jpg", "10x15", "fosco", 4, 1, 0.5, "original"],
      ["dois.jpg", "20x30", "brilho", 1, 1, 0.5, "original"],
    ]);

    // Ajuste guardado apontando para fora de Originais: não lê o arquivo (conta como "não abriu").
    const outside = path.join(root, "segredo.jpg");
    writeFileSync(outside, await sharp({ create: { width: 900, height: 600, channels: 3, background: "#000" } }).jpeg().toBuffer());
    const stored = [
      { ...edits, original: "Originais/../../../segredo.jpg", name: "x.jpg", width: 900, height: 600, sizeId: "10x15", paper: "brilho", copies: 1 },
      { ...edits, original: "Originais/foto-01 - um.jpg", name: "um.jpg", width: 1800, height: 1200, sizeId: "10x15", paper: "brilho", copies: 2 },
    ];
    database.prepare("UPDATE fare_photo_orders SET photos_json = ? WHERE id = ?").run(JSON.stringify(stored), sent.photoOrder.id);
    const guarded = await reopenPhotoLink(database, token);
    expect(guarded.missing).toBe(1);
    expect(guarded.photos.map((photo) => photo.name)).toEqual(["um.jpg"]);
  });

  it("pedido de fotos feito pelo site: o link da equipe já nasce com as fotos e o reenvio substitui o pedido de fotos", async () => {
    const result = await createPhotoOrder(database, { id: "cliente-site" }, {
      customer: { name: "Fábio Nunes", phone: "(11) 93333-2222" }, delivery: "entrega",
      photos: [{ ...edits, uploadId: await upload("site.jpg"), sizeId: "10x15", paper: "brilho", copies: 3, zoom: 1.4 }],
    });
    const orderId = result.order.orderId!;
    expect(result.order.photos).toEqual([expect.objectContaining({ original: "Originais/foto-01 - site.jpg", zoom: 1.4, copies: 3 })]);
    const token = createPhotoLink(database, "order", orderId, "Equipe");
    expect(photoLinkView(database, token)).toMatchObject({ editable: true, submittedAt: result.order.createdAt, previous: { id: result.order.id, photos: 1, copies: 3 } });
    const reopened = await reopenPhotoLink(database, token);
    expect(reopened.photos[0]).toMatchObject({ name: "site.jpg", zoom: 1.4, copies: 3 });
    const again = await submitPhotoLink(database, token, [{ ...reopened.photos[0], copies: 8 }]);
    expect(again.photoOrder).toMatchObject({ code: result.order.code, folder: result.order.folder, delivery: "entrega", orderId });
    expect(getPhotoOrder(database, result.order.id)).toBeNull();
    expect(findOrderById(database, orderId)!.items).toEqual([expect.objectContaining({ productName: "Revelação 10 × 15 cm · papel Brilho", quantity: 8 })]);
    expect(existsSync(path.join(result.order.folder, "10x15 Brilho", "foto-01 (8 copias).jpg"))).toBe(true);
  });
});
