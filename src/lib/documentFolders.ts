import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { QuoteCartItem } from "@/lib/commerce";
import { documentNumberOf, formatDocumentNumber } from "@/lib/documentNumber";
import { getOrderFinance } from "@/lib/orders/payments";
import { findOrderById, runOrderMigrations } from "@/lib/orders/repository";
import { dayFolder, ORDERS_DIR } from "@/lib/photoOrders/config";
import { ensurePhotoOrderTables } from "@/lib/photoOrders/repository";
import { firstAndLastName, safeFolderName } from "@/lib/photoOrders/finalize";
import { buildOrderDocument } from "@/lib/proposals/orderDocument";
import { buildProposal, type ProductDetails } from "@/lib/proposals/proposal";
import { NO_CUSTOMER_NAME } from "@/lib/quotes/quoteCode";
import { findQuoteById, runQuoteMigrations } from "@/lib/quotes/repository";

/*
 * Pasta de cada orçamento/pedido na pasta da equipe (D:\Digital, pela cópia do oraculo), mesmo sem fotos:
 *   <DD-MM>/<Nome Sobrenome - ORC-0001>/Orçamento ORC-0001.html
 * Virou pedido: a mesma pasta passa a "Nome Sobrenome - PED-0001" e ganha "Pedido PED-0001.html"
 * (o arquivo do orçamento fica junto). Fotos enviadas pelo link entram na mesma pasta.
 */

export type DocumentFolderDeps = {
  imageOf: (item: QuoteCartItem) => Promise<string | null>;
  detailsOf: (item: QuoteCartItem) => Promise<ProductDetails>;
  renderQuote: (proposal: ReturnType<typeof buildProposal>) => Promise<string>;
  renderOrder: (document: ReturnType<typeof buildOrderDocument>) => Promise<string>;
  siteUrl: string;
  ordersDir?: string;
};

function ensureTable(db: DatabaseSync) {
  runQuoteMigrations(db);
  runOrderMigrations(db);
  ensurePhotoOrderTables(db);
  db.exec(`CREATE TABLE IF NOT EXISTS fare_document_folders (number INTEGER PRIMARY KEY, folder TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fare_document_folder_sync (id INTEGER PRIMARY KEY CHECK (id = 1), last_run TEXT NOT NULL)`);
}

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "Equipe";

/** Pasta do número (cria ou renomeia: nome do cliente mudou, orçamento virou pedido). null = ainda sem cliente. */
async function folderFor(db: DatabaseSync, n: number, customerName: string, ordersDir: string) {
  const prefix = formatDocumentNumber(n);
  const isOrder = Boolean(db.prepare("SELECT 1 FROM fare_orders WHERE id LIKE ?").get(`${prefix}-%`));
  const code = `${isOrder ? "PED" : "ORC"}-${prefix}`;
  const name = `${safeFolderName(firstAndLastName(customerName))} - ${code}`;
  const row = db.prepare("SELECT folder FROM fare_document_folders WHERE number = ?").get(n) as { folder: string } | undefined;
  // Fotos do link já criaram a pasta deste número? Usa a mesma.
  const photos = row ? undefined : db.prepare("SELECT folder FROM fare_photo_orders WHERE code IN (?, ?) ORDER BY created_at LIMIT 1")
    .get(`ORC-${prefix}`, `PED-${prefix}`) as { folder: string } | undefined;
  const current = row?.folder ?? photos?.folder ?? null;
  const target = current ? path.join(path.dirname(current), name) : path.join(ordersDir, dayFolder(), name);
  if (current && current !== target && existsSync(current) && !existsSync(target)) {
    await rename(current, target);
    // Fotos guardadas dentro da pasta antiga passam a apontar para a nova.
    db.prepare("UPDATE fare_photo_orders SET folder = ? || substr(folder, ?) WHERE folder = ? OR folder LIKE ?")
      .run(target, current.length + 1, current, `${current}${path.sep}%`);
  }
  await mkdir(target, { recursive: true });
  db.prepare("INSERT INTO fare_document_folders (number, folder, updated_at) VALUES (?, ?, ?) ON CONFLICT(number) DO UPDATE SET folder = excluded.folder, updated_at = excluded.updated_at")
    .run(n, target, new Date().toISOString());
  return target;
}

async function lookups(items: QuoteCartItem[], deps: DocumentFolderDeps) {
  const images = new Map<string, string | null>();
  const details = new Map<string, ProductDetails | null>();
  await Promise.all(items.map(async (item) => {
    images.set(item.id, await deps.imageOf(item).catch(() => null));
    details.set(item.id, await deps.detailsOf(item).catch(() => null));
  }));
  return { imageOf: (item: QuoteCartItem) => images.get(item.id) ?? null, detailsOf: (item: QuoteCartItem) => details.get(item.id) ?? null };
}

/** Grava (ou atualiza) a pasta e o arquivo de um orçamento ou pedido. Id antigo (sem número) ou sem cliente: nada. */
export async function saveDocumentFolder(db: DatabaseSync, kind: "quote" | "order", id: string, deps: DocumentFolderDeps) {
  ensureTable(db);
  const n = documentNumberOf(id);
  if (n === null) return null;
  const ordersDir = deps.ordersDir ?? ORDERS_DIR;
  if (kind === "quote") {
    const quote = findQuoteById(db, id);
    if (!quote || !quote.customer.name || quote.customer.name === NO_CUSTOMER_NAME) return null;
    const folder = await folderFor(db, n, quote.customer.name, ordersDir);
    try {
      const proposal = buildProposal(quote, { seller: firstName(quote.createdBy), siteUrl: deps.siteUrl, ...(await lookups(quote.items, deps)) });
      await writeFile(path.join(folder, `Orçamento ${proposal.code}.html`), await deps.renderQuote(proposal));
    } catch { /* orçamento ainda sem preço: fica só a pasta, o arquivo sai quando der para gerar */ }
    return folder;
  }
  const order = findOrderById(db, id);
  if (!order || !order.customer.name) return null;
  const folder = await folderFor(db, n, order.customer.name, ordersDir);
  const finance = getOrderFinance(db, id);
  const document = buildOrderDocument(order, finance, { seller: firstName(finance?.createdBy), siteUrl: deps.siteUrl, ...(await lookups(order.items, deps)) });
  await writeFile(path.join(folder, `Pedido ${document.code}.html`), await deps.renderOrder(document));
  return folder;
}

/** O que mudou desde a última rodada: orçamentos e pedidos editados, pedidos fechados ou com pagamento novo. */
export function changedDocuments(db: DatabaseSync, since: string | null) {
  ensureTable(db);
  const after = since ?? "";
  const quotes = (db.prepare("SELECT id FROM fare_quotes WHERE updated_at > ? AND status != 'virou_pedido'").all(after) as Array<{ id: string }>).map((r) => r.id);
  const hasFinance = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'fare_order_payments'").get());
  const orders = (db.prepare(`SELECT id FROM fare_orders WHERE updated_at > ?
    ${hasFinance ? "UNION SELECT order_id FROM fare_order_finance WHERE created_at > ? UNION SELECT order_id FROM fare_order_payments WHERE created_at > ?" : ""}`)
    .all(...(hasFinance ? [after, after, after] : [after])) as Array<{ id: string }>).map((r) => r.id);
  return { quotes: quotes.filter((id) => documentNumberOf(id) !== null), orders: orders.filter((id) => documentNumberOf(id) !== null) };
}

/** Uma rodada: grava as pastas do que mudou. Erro num documento não para os outros. */
export async function syncDocumentFolders(db: DatabaseSync, deps: DocumentFolderDeps) {
  ensureTable(db);
  const startedAt = new Date().toISOString();
  const last = (db.prepare("SELECT last_run FROM fare_document_folder_sync WHERE id = 1").get() as { last_run: string } | undefined)?.last_run ?? null;
  const { quotes, orders } = changedDocuments(db, last);
  for (const [kind, ids] of [["quote", quotes], ["order", orders]] as const) {
    for (const id of ids) {
      await saveDocumentFolder(db, kind, id, deps).catch((error) => console.error(`[pastas] ${kind} ${id}:`, error instanceof Error ? error.message : error));
    }
  }
  db.prepare("INSERT INTO fare_document_folder_sync (id, last_run) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_run = excluded.last_run").run(startedAt);
  return quotes.length + orders.length;
}

/** Pasta já criada para este orçamento/pedido (fotos do link vão para ela). */
export function existingDocumentFolder(db: DatabaseSync, id: string) {
  ensureTable(db);
  const n = documentNumberOf(id);
  if (n === null) return null;
  const row = db.prepare("SELECT folder FROM fare_document_folders WHERE number = ?").get(n) as { folder: string } | undefined;
  return row && existsSync(row.folder) ? row.folder : null;
}

const SYNC_MS = 30_000;
const state = globalThis as typeof globalThis & { fareDocumentFolders?: ReturnType<typeof setInterval> };

/** Liga a rodada a cada 30 s (uma por servidor). */
export function startDocumentFolderSync(db: DatabaseSync, deps: DocumentFolderDeps) {
  if (state.fareDocumentFolders) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await syncDocumentFolders(db, deps); } catch (error) { console.error("[pastas]", error); } finally { running = false; }
  };
  state.fareDocumentFolders = setInterval(() => void tick(), SYNC_MS);
  state.fareDocumentFolders.unref?.();
  void tick();
}
