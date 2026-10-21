// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { syncDocumentFolders } from "@/lib/documentFolders";
import { createOrder } from "@/lib/orders/repository";
import { dayFolder } from "@/lib/photoOrders/config";
import { createManualQuote } from "@/lib/quotes/repository";

const items = [{ id: "a", productName: "Caneca", slug: "brindes/x", quantity: 10, selections: {}, artworkName: null, unitPrice: 12 }];

describe("pasta do orçamento/pedido", () => {
  it("ORC cria a pasta com o orçamento; virou pedido, a pasta vira PED com os dois arquivos; sem cliente, nada", async () => {
    const db = new DatabaseSync(":memory:");
    const root = mkdtempSync(path.join(tmpdir(), "fare-docs-"));
    const deps = {
      imageOf: async () => null, detailsOf: async () => ({ description: "", specs: [] }) as never,
      renderQuote: async (p: { code: string }) => `orçamento ${p.code}`, renderOrder: async (d: { code: string }) => `pedido ${d.code}`,
      siteUrl: "https://x", ordersDir: root,
    } as never;
    const semCliente = createManualQuote(db, { ownerId: "sem-cliente", customer: { name: "Cliente a definir" }, items, createdBy: "Bia", internalNotes: "", idempotencyKey: "k0" });
    const quote = createManualQuote(db, { ownerId: "u1", customer: { name: "Ana Maria Silva" }, items, createdBy: "Bia", internalNotes: "", idempotencyKey: "k1" });
    expect(semCliente.id.startsWith("0001-")).toBe(true);

    await syncDocumentFolders(db, deps);
    const day = path.join(root, dayFolder());
    expect(readdirSync(day)).toEqual(["Ana Silva - ORC-0002"]);
    expect(readFileSync(path.join(day, "Ana Silva - ORC-0002", "Orçamento ORC-0002.html"), "utf8")).toBe("orçamento ORC-0002");

    // Fechar o orçamento cria o PED-0002 (mesmo número)
    db.prepare("UPDATE fare_quotes SET status = 'virou_pedido', updated_at = ? WHERE id = ?").run(new Date(Date.now() + 1000).toISOString(), quote.id);
    createOrder(db, { userId: "u1", idempotencyKey: `orc:${quote.id}`, customer: { name: "Ana Maria Silva" }, items, paymentMethod: "pix" });
    await syncDocumentFolders(db, deps);
    expect(existsSync(path.join(day, "Ana Silva - ORC-0002"))).toBe(false);
    expect(readdirSync(path.join(day, "Ana Silva - PED-0002")).sort()).toEqual(["Orçamento ORC-0002.html", "Pedido PED-0002.html"]);

    // Nada mudou: rodada seguinte não refaz nada
    expect(await syncDocumentFolders(db, deps)).toBe(0);
  });
});
