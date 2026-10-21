import { randomBytes, randomUUID } from "node:crypto";
import { isProfessional } from "@/lib/professional";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { photoFromName, photoItemName, photoTablePrice } from "@/components/staff/photoItems";
import { paperLabel, PRO_PRICES, type Paper } from "@/components/fotos/catalog";
import { buildQuoteItems } from "@/lib/backoffice/quoteBuilder";
import type { QuoteCartItem } from "@/lib/commerce";
import { orderCode } from "@/lib/orders/orderCode";
import { getOrderFinance } from "@/lib/orders/payments";
import { findOrderById } from "@/lib/orders/repository";
import { assemblePhotoFolder, PhotoOrderError, readPhotos, validatePhotos } from "@/lib/photoOrders/finalize";
import { codeExists, ensurePhotoOrderTables } from "@/lib/photoOrders/repository";
import { existingDocumentFolder } from "@/lib/documentFolders";
import { applyDiscount, type QuoteDiscount } from "@/lib/quotes/discount";
import { NO_CUSTOMER_NAME } from "@/lib/quotes/quoteCode";
import { findQuoteById, quoteCode, replaceQuoteItems } from "@/lib/quotes/repository";

/*
 * Link das fotos: a equipe manda ao cliente um endereço secreto (/fotos/<token>) de um orçamento ou pedido.
 * O cliente vê os brindes (fixos) e as fotos, anexa, corta, escolhe papel e quantidades e envia.
 * Ao enviar: as fotos vão para a pasta do cliente e as linhas de foto do documento são trocadas pelo que ele escolheu.
 * Preço por foto: o especial da equipe (se houver) para aquele tamanho; senão, a tabela do site.
 */

export type PhotoLinkKind = "quote" | "order";
type LinkRow = { token: string; kind: PhotoLinkKind; doc_id: string; created_by: string; created_at: string; submitted_at: string | null; photo_order_id: string | null };

export function ensurePhotoLinkTables(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_photo_links (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('quote', 'order')),
      doc_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      submitted_at TEXT,
      photo_order_id TEXT
    );
    CREATE INDEX IF NOT EXISTS fare_photo_links_doc ON fare_photo_links (kind, doc_id);
  `);
}

/** Link aberto do documento (o mesmo enquanto o cliente não enviar); depois do envio, um novo. */
export function createPhotoLink(database: DatabaseSync, kind: PhotoLinkKind, docId: string, actorName: string) {
  ensurePhotoLinkTables(database);
  const open = database.prepare("SELECT token FROM fare_photo_links WHERE kind = ? AND doc_id = ? AND submitted_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .get(kind, docId) as { token: string } | undefined;
  if (open) return open.token;
  const token = randomBytes(18).toString("base64url");
  database.prepare("INSERT INTO fare_photo_links (token, kind, doc_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(token, kind, docId, actorName, new Date().toISOString());
  return token;
}

function findLink(database: DatabaseSync, token: string): LinkRow | null {
  ensurePhotoLinkTables(database);
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  return (database.prepare("SELECT * FROM fare_photo_links WHERE token = ?").get(token) as LinkRow | undefined) ?? null;
}

const QUOTE_EDITABLE = ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"];
const ORDER_EDITABLE = ["aguardando_pagamento", "aguardando_arte", "criando_arte", "aguardando_producao"];

/** Foto do documento: item com nome de foto (painel) ou linha de pedido de fotos do site ("fotos/…"). */
export function photoOf(item: QuoteCartItem): { sizeId: string; paper?: Paper } | null {
  const named = photoFromName(item.productName);
  if (!named) return null;
  const paper = named.paper ?? (item.selections?.Papel === "Fosco" ? "fosco" : item.selections?.Papel === "Brilho" ? "brilho" : undefined);
  return { sizeId: named.sizeId, ...(paper ? { paper } : {}) };
}

function loadDocument(database: DatabaseSync, link: LinkRow) {
  if (link.kind === "quote") {
    const quote = findQuoteById(database, link.doc_id);
    if (!quote) return null;
    return {
      kind: link.kind, id: quote.id, code: quoteCode(quote.id), userId: quote.userId, customer: quote.customer, items: quote.items,
      discount: quote.discount, editable: QUOTE_EDITABLE.includes(quote.status), paidCents: 0, updatedAt: quote.updatedAt, internalNotes: quote.internalNotes,
    };
  }
  const order = findOrderById(database, link.doc_id);
  if (!order) return null;
  return {
    kind: link.kind, id: order.id, code: orderCode(order.id), userId: order.userId, customer: order.customer, items: order.items as QuoteCartItem[],
    discount: order.discount, editable: ORDER_EDITABLE.includes(order.status), paidCents: getOrderFinance(database, order.id)?.paidCents ?? 0,
    updatedAt: order.updatedAt, internalNotes: "",
  };
}
type LinkDocument = NonNullable<ReturnType<typeof loadDocument>>;

/** Preço especial da equipe por tamanho: quando o preço gravado difere da tabela para aquela quantidade. */
/** Preços que valem neste documento: os combinados pela equipe e, se o cliente é profissional, a tabela profissional. */
function specialPrices(items: QuoteCartItem[], pro = false) {
  const bySize = new Map<string, { quantity: number; unitPrice: number | null }[]>();
  for (const item of items) {
    const photo = photoOf(item);
    if (photo) bySize.set(photo.sizeId, [...(bySize.get(photo.sizeId) ?? []), { quantity: item.quantity, unitPrice: item.unitPrice }]);
  }
  const special: Record<string, number> = pro ? { ...PRO_PRICES } : {};
  for (const [sizeId, lines] of bySize) {
    const table = photoTablePrice(sizeId, lines.reduce((sum, line) => sum + line.quantity, 0), pro);
    const custom = lines.find((line) => line.unitPrice !== null && Math.abs(line.unitPrice - table) > 0.004);
    if (custom) special[sizeId] = custom.unitPrice!;
  }
  return special;
}

export type PhotoLinkView = {
  code: string;
  kindLabel: "orçamento" | "pedido";
  customerName: string;
  editable: boolean;
  submittedAt: string | null;
  /** Brindes e outros itens: fixos, só para o cliente ver o total. */
  others: Array<{ id: string; name: string; details: string; quantity: number; unitPrice: number | null }>;
  /** Fotos pedidas pela equipe (ponto de partida). */
  photos: Array<{ sizeId: string; quantity: number }>;
  special: Record<string, number>;
  discount: QuoteDiscount | null;
};

export function photoLinkView(database: DatabaseSync, token: string): PhotoLinkView | null {
  const link = findLink(database, token);
  const doc = link && loadDocument(database, link);
  if (!link || !doc) return null;
  return {
    code: doc.code,
    kindLabel: doc.kind === "quote" ? "orçamento" : "pedido",
    customerName: doc.customer.name === NO_CUSTOMER_NAME ? "" : doc.customer.name,
    editable: doc.editable && !link.submitted_at,
    submittedAt: link.submitted_at,
    others: doc.items.filter((item) => !photoOf(item)).map((item) => ({
      id: item.id, name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice,
      details: [item.selections?.["Variação"], ...(item.gravacoes ?? []).map((g) => (g.local ? `${g.descricao} (${g.local})` : g.descricao))].filter(Boolean).join(" · "),
    })),
    photos: doc.items.flatMap((item) => {
      const photo = photoOf(item);
      return photo ? [{ sizeId: photo.sizeId, quantity: item.quantity }] : [];
    }),
    special: specialPrices(doc.items, isProfessional(database, doc.userId)),
    discount: doc.discount ?? null,
  };
}

/** Total do documento em centavos com as linhas novas (null = algum item "sob consulta"). */
function documentTotal(items: QuoteCartItem[], discount: QuoteDiscount | null) {
  if (items.some((item) => item.unitPrice === null)) return null;
  return applyDiscount(Math.round(items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100), discount).totalCents;
}

/** Cliente enviou: monta a pasta e troca as linhas de foto do orçamento/pedido pelo que ele escolheu. */
function documentPhotosFolder(database: DatabaseSync, id: string) {
  const folder = existingDocumentFolder(database, id);
  return folder ? path.join(folder, "Fotos") : null;
}

export async function submitPhotoLink(database: DatabaseSync, token: string, rawPhotos: unknown) {
  const link = findLink(database, token);
  const doc = link && loadDocument(database, link);
  if (!link || !doc) throw new PhotoOrderError("Link não encontrado. Peça um novo à loja.");
  if (link.submitted_at) throw new PhotoOrderError("As fotos deste link já foram enviadas. Se quiser mudar algo, fale com a loja.");
  if (!doc.editable) throw new PhotoOrderError("Este orçamento/pedido não aceita mais alterações. Fale com a loja.");
  const photos = validatePhotos(rawPhotos);
  const { uploads, summary } = await readPhotos(photos);
  const special = specialPrices(doc.items, isProfessional(database, doc.userId));
  const unitPrice = (sizeId: string, table: number) => special[sizeId] ?? table;

  // Linhas novas do documento: uma por tamanho + papel (calculadas antes de mexer em pasta ou banco).
  const drafts = summary.sizes.flatMap((group) => group.papers.map((line) => ({
    id: `foto-${group.size.id}-${line.paper}`, source: "avulso" as const, name: photoItemName({ sizeId: group.size.id, paper: line.paper }),
    cost: 0, quantity: line.copies, gravacoes: [], priceOverride: unitPrice(group.size.id, group.price.unit),
    fotos: line.photos.length, paper: line.paper,
  })));
  const built = buildQuoteItems(drafts, () => null, { name: "Cliente (link das fotos)" });
  if (built.items.length !== drafts.length) throw new PhotoOrderError("Não foi possível calcular o preço das fotos. Fale com a loja.");
  const photoItems = built.items.map((item, index) => ({
    ...item, selections: { Papel: paperLabel(drafts[index].paper), Fotos: `${drafts[index].fotos} ${drafts[index].fotos === 1 ? "foto" : "fotos"}` },
  }));
  const items = [...doc.items.filter((item) => !photoOf(item)), ...photoItems];
  const total = documentTotal(items, doc.discount);
  if (doc.kind === "order" && total !== null && total < doc.paidCents) {
    throw new PhotoOrderError("Com essas quantidades o pedido fica menor que o valor já pago. Fale com a loja.");
  }

  let code = doc.code;
  for (let n = 2; codeExists(database, code); n++) code = `${doc.code} envio ${n}`;
  const result = await assemblePhotoFolder(database, {
    id: randomUUID(), orderId: doc.kind === "order" ? doc.id : null, code, userId: doc.userId,
    customer: { name: doc.customer.name, phone: doc.customer.phone ?? "", company: doc.customer.company ?? null },
    delivery: "retirada", photos, uploads, summary, unitPrice,
    // 1º envio vai para "Fotos" dentro da pasta do orçamento/pedido (erro apaga só essa subpasta); envios seguintes, pasta própria.
    folder: code === doc.code ? documentPhotosFolder(database, doc.id) : null,
  });

  try {
    saveItems(database, doc, items, total);
    database.prepare("UPDATE fare_photo_links SET submitted_at = ?, photo_order_id = ? WHERE token = ?").run(new Date().toISOString(), result.order.id, token);
  } catch (error) {
    await rm(result.order.folder, { recursive: true, force: true });
    database.prepare("DELETE FROM fare_photo_orders WHERE id = ?").run(result.order.id);
    throw error;
  }
  return { code: doc.code, totalCents: total, photoOrder: result.order };
}

function saveItems(database: DatabaseSync, doc: LinkDocument, items: QuoteCartItem[], total: number | null) {
  if (doc.kind === "quote") {
    replaceQuoteItems(database, { quoteId: doc.id, items, internalNotes: doc.internalNotes, expectedUpdatedAt: doc.updatedAt });
    return;
  }
  const result = database.prepare("UPDATE fare_orders SET items_snapshot = ?, total_cents = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
    .run(JSON.stringify(items), total, new Date().toISOString(), doc.id, doc.updatedAt);
  if (Number(result.changes) !== 1) throw new PhotoOrderError("O pedido foi alterado pela loja agora há pouco. Recarregue a página e envie de novo.");
}

/**
 * Orçamento virou pedido: as pastas das fotos enviadas pelo link ("Nome - ORC-0001") passam a ser do pedido
 * ("Nome - PED-0001", mesmo número), junto com o .html e o registro no banco. Se uma pasta não puder ser
 * renomeada (aberta em outro programa), fica como está e o erro vai para o log — o pedido já foi criado.
 */
export async function movePhotoFoldersToOrder(database: DatabaseSync, quoteId: string, orderId: string) {
  ensurePhotoLinkTables(database);
  ensurePhotoOrderTables(database);
  const oldBase = quoteCode(quoteId);
  const newBase = orderCode(orderId);
  const rows = database.prepare(`
    SELECT p.id, p.code, p.folder FROM fare_photo_links l JOIN fare_photo_orders p ON p.id = l.photo_order_id
    WHERE l.kind = 'quote' AND l.doc_id = ? AND p.order_id IS NULL
  `).all(quoteId) as Array<{ id: string; code: string; folder: string }>;
  for (const row of rows) {
    const code = row.code.startsWith(oldBase) ? newBase + row.code.slice(oldBase.length) : row.code; // mantém " envio 2"
    const name = path.basename(row.folder);
    const folder = name.endsWith(row.code) ? path.join(path.dirname(row.folder), name.slice(0, -row.code.length) + code) : row.folder;
    try {
      if (folder !== row.folder && existsSync(row.folder) && !existsSync(folder)) await rename(row.folder, folder);
      const oldHtml = path.join(folder, `${row.code}.html`);
      if (code !== row.code && existsSync(oldHtml)) {
        await writeFile(path.join(folder, `${code}.html`), (await readFile(oldHtml, "utf8")).replaceAll(row.code, code));
        await rm(oldHtml, { force: true });
      }
      database.prepare("UPDATE fare_photo_orders SET code = ?, folder = ?, order_id = ? WHERE id = ?").run(code, existsSync(folder) ? folder : row.folder, orderId, row.id);
    } catch (error) {
      console.error(`[fotos] não foi possível passar ${row.folder} para ${code}:`, error instanceof Error ? error.message : error);
    }
  }
}
