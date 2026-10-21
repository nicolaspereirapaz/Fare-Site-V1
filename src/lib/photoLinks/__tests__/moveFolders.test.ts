// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ensurePhotoLinkTables, movePhotoFoldersToOrder } from "@/lib/photoLinks/links";
import { ensurePhotoOrderTables } from "@/lib/photoOrders/repository";

describe("orçamento virou pedido: pasta das fotos", () => {
  it("Nome - ORC-0007 vira Nome - PED-0007, com o .html e o banco", async () => {
    const db = new DatabaseSync(":memory:");
    ensurePhotoLinkTables(db);
    ensurePhotoOrderTables(db);
    const quoteId = "0007-11111111-2222-4333-8444-555555555555";
    const orderId = "0007-66666666-7777-4888-8999-aaaaaaaaaaaa";
    const day = mkdtempSync(path.join(tmpdir(), "fare-"));
    const oldFolder = path.join(day, "Ana Silva - ORC-0007");
    mkdirSync(oldFolder);
    writeFileSync(path.join(oldFolder, "ORC-0007.html"), "<h1>ORC-0007</h1>");
    db.prepare("INSERT INTO fare_customer_numbers (user_id, folder_name, created_at) VALUES ('u1', 'Ana Silva - C0001', 'x')").run();
    db.prepare(`INSERT INTO fare_photo_orders (id, code, user_id, customer_number, customer_json, delivery, lines_json, total_cents, photo_count, copies, folder, created_at)
      VALUES ('f1', 'ORC-0007', 'u1', 1, '{}', 'retirada', '[]', 0, 1, 1, ?, 'x')`).run(oldFolder);
    db.prepare("INSERT INTO fare_photo_links (token, kind, doc_id, created_by, created_at, photo_order_id) VALUES ('t', 'quote', ?, 's', 'x', 'f1')").run(quoteId);

    await movePhotoFoldersToOrder(db, quoteId, orderId);

    const newFolder = path.join(day, "Ana Silva - PED-0007");
    expect(existsSync(oldFolder)).toBe(false);
    expect(readFileSync(path.join(newFolder, "PED-0007.html"), "utf8")).toBe("<h1>PED-0007</h1>");
    expect(db.prepare("SELECT code, folder, order_id FROM fare_photo_orders").get()).toEqual({ code: "PED-0007", folder: newFolder, order_id: orderId });
  });
});
