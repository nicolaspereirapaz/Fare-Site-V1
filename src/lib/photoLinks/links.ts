import { randomBytes, randomUUID } from "node:crypto";
import { isProfessional } from "@/lib/professional";
import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { photoFromName, photoItemName, photoTablePrice } from "@/components/staff/photoItems";
import { paperLabel, PRO_PRICES, type Paper } from "@/components/fotos/catalog";
import { buildQuoteItems } from "@/lib/backoffice/quoteBuilder";
import type { QuoteCartItem } from "@/lib/commerce";
import { orderCode } from "@/lib/orders/orderCode";
import { getOrderFinance } from "@/lib/orders/payments";
import { findOrderById } from "@/lib/orders/repository";
import { assemblePhotoFolder, inBatches, PhotoOrderError, readPhotos, validatePhotos } from "@/lib/photoOrders/finalize";
import { codeExists, ensurePhotoOrderTables, getPhotoOrder, type PhotoOrder } from "@/lib/photoOrders/repository";
import { saveUpload } from "@/lib/photoOrders/uploads";
import { photoLinkEditable } from "@/lib/photoLinks/editable";
import { existingDocumentFolder } from "@/lib/documentFolders";
import { applyDiscount, type QuoteDiscount } from "@/lib/quotes/discount";
import { NO_CUSTOMER_NAME } from "@/lib/quotes/quoteCode";
import { findQuoteById, quoteCode, replaceQuoteItems } from "@/lib/quotes/repository";

/*
 * Link das fotos: a equipe manda ao cliente um endereço secreto (/fotos/<token>) de um orçamento ou pedido.
 * O cliente vê os brindes (fixos) e as fotos, anexa, corta, escolhe papel e quantidades e envia.
 * Ao enviar: as fotos vão para a pasta do cliente e as linhas de foto do documento são trocadas pelo que ele escolheu.
 * Preço por foto: o especial da equipe (se houver) para aquele tamanho; senão, a tabela do site.
 * Depois do envio o mesmo link reabre com as fotos enviadas (cliente, ou a equipe pelo "Editar fotos") até o pedido
 * entrar em produção; o reenvio SUBSTITUI o anterior (pasta, registro das fotos e linhas do documento).
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

/**
 * Link do documento: sempre o mesmo (antes e depois do envio, que pode ser editado pelo próprio link).
 * Pedido que já tem fotos (pedido de fotos feito pelo site, ou fotos vindas do orçamento): o link novo já nasce
 * com elas, para reabrir e editar em vez de criar um segundo envio.
 */
export function createPhotoLink(database: DatabaseSync, kind: PhotoLinkKind, docId: string, actorName: string) {
  ensurePhotoLinkTables(database);
  ensurePhotoOrderTables(database);
  const latest = database.prepare("SELECT token FROM fare_photo_links WHERE kind = ? AND doc_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(kind, docId) as { token: string } | undefined;
  if (latest) return latest.token;
  const existing = kind === "order"
    ? database.prepare("SELECT id, created_at FROM fare_photo_orders WHERE order_id = ? ORDER BY (code = ?) DESC, created_at LIMIT 1")
      .get(docId, orderCode(docId)) as { id: string; created_at: string } | undefined
    : undefined;
  const token = randomBytes(18).toString("base64url");
  database.prepare("INSERT INTO fare_photo_links (token, kind, doc_id, created_by, created_at, submitted_at, photo_order_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(token, kind, docId, actorName, new Date().toISOString(), existing?.created_at ?? null, existing?.id ?? null);
  return token;
}

function findLink(database: DatabaseSync, token: string): LinkRow | null {
  ensurePhotoLinkTables(database);
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  return (database.prepare("SELECT * FROM fare_photo_links WHERE token = ?").get(token) as LinkRow | undefined) ?? null;
}


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
    // Orçamento virou pedido: o mesmo link passa a editar o pedido (as fotos foram junto, ver movePhotoFoldersToOrder).
    if (quote.status === "virou_pedido" && quote.orderId) return loadOrder(database, quote.orderId);
    return {
      kind: "quote" as PhotoLinkKind, id: quote.id, code: quoteCode(quote.id), userId: quote.userId, customer: quote.customer, items: quote.items,
      discount: quote.discount, editable: photoLinkEditable("quote", quote.status), paidCents: 0, updatedAt: quote.updatedAt, internalNotes: quote.internalNotes,
    };
  }
  return loadOrder(database, link.doc_id);
}

function loadOrder(database: DatabaseSync, id: string) {
  const order = findOrderById(database, id);
  if (!order) return null;
  return {
    kind: "order" as PhotoLinkKind, id: order.id, code: orderCode(order.id), userId: order.userId, customer: order.customer, items: order.items as QuoteCartItem[],
    discount: order.discount, editable: photoLinkEditable("order", order.status), paidCents: getOrderFinance(database, order.id)?.paidCents ?? 0,
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
  /** Aceita envio ou alteração (orçamento aberto / pedido antes da produção), mesmo depois de já ter enviado. */
  editable: boolean;
  submittedAt: string | null;
  /** O que já foi enviado (para "Alterar fotos"); null = nada ainda ou as fotos foram apagadas. */
  previous: { id: string; photos: number; copies: number } | null;
  /** Brindes e outros itens: fixos, só para o cliente ver o total. */
  others: Array<{ id: string; name: string; details: string; quantity: number; unitPrice: number | null }>;
  /** Fotos pedidas pela equipe (ponto de partida). `paper`: papel escolhido pela equipe; o cliente pode trocar. */
  photos: Array<{ sizeId: string; quantity: number; paper?: Paper }>;
  special: Record<string, number>;
  discount: QuoteDiscount | null;
};

export function photoLinkView(database: DatabaseSync, token: string): PhotoLinkView | null {
  const link = findLink(database, token);
  const doc = link && loadDocument(database, link);
  if (!link || !doc) return null;
  const previous = previousOf(database, link);
  return {
    code: doc.code,
    kindLabel: doc.kind === "quote" ? "orçamento" : "pedido",
    customerName: doc.customer.name === NO_CUSTOMER_NAME ? "" : doc.customer.name,
    editable: doc.editable,
    submittedAt: link.submitted_at,
    previous: previous && !previous.filesDeletedAt ? { id: previous.id, photos: previous.photoCount, copies: previous.copies } : null,
    others: doc.items.filter((item) => !photoOf(item)).map((item) => ({
      id: item.id, name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice,
      details: [item.selections?.["Variação"], ...(item.gravacoes ?? []).map((g) => (g.local ? `${g.descricao} (${g.local})` : g.descricao))].filter(Boolean).join(" · "),
    })),
    photos: doc.items.flatMap((item) => {
      const photo = photoOf(item);
      return photo ? [{ sizeId: photo.sizeId, quantity: item.quantity, ...(photo.paper ? { paper: photo.paper } : {}) }] : [];
    }),
    special: specialPrices(doc.items, isProfessional(database, doc.userId)),
    discount: doc.discount ?? null,
  };
}

/** Página da equipe do documento do link (orçamento que virou pedido → o pedido). Só para quem tem sessão da equipe. */
export function photoLinkStaffUrl(database: DatabaseSync, token: string) {
  const link = findLink(database, token);
  const doc = link && loadDocument(database, link);
  if (!doc) return null;
  return doc.kind === "order" ? `/equipe/pedidos/${doc.id}` : `/equipe/orcamentos/${doc.id}`;
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

const previousOf = (database: DatabaseSync, link: LinkRow) => (link.photo_order_id ? getPhotoOrder(database, link.photo_order_id) : null);

const lockedMessage = (doc: LinkDocument) => doc.kind === "order"
  ? `O pedido ${doc.code} já entrou em produção ou foi encerrado: as fotos não podem mais ser alteradas. Fale com a loja pelo WhatsApp.`
  : `O orçamento ${doc.code} já foi fechado ou encerrado: as fotos não podem mais ser alteradas. Fale com a loja pelo WhatsApp.`;

/** Foto do envio anterior pronta para o editor: um envio novo (cópia do original) com os ajustes de antes. */
export type ReopenedPhoto = {
  uploadId: string; name: string; width: number; height: number; convertedFrom: string | null;
  sizeId: string; paper: Paper; copies: number; fit: "preencher" | "encaixar"; landscape: boolean; zoom: number; x: number; y: number;
  border: number; filter: string; filterStrength: number; brightness: number; contrast: number; saturation: number;
};

/** Arquivo dentro de <pasta do pedido>/Originais (só o nome do arquivo vale: nada de subpasta nem ".."). */
function originalPath(folder: string, relative: string) {
  const parts = relative.split(/[\\/]/);
  const name = parts[parts.length - 1];
  if (parts.length !== 2 || parts[0] !== "Originais" || !name || name === "." || name === ".." || name.startsWith(".")) return null;
  const file = path.resolve(folder, "Originais", name);
  return path.relative(path.resolve(folder, "Originais"), file) === name ? file : null;
}

/**
 * Fotos do envio anterior com o que o cliente escolheu. Envios novos guardam os ajustes de cada foto; os antigos
 * (sem `photos`) voltam com tamanho, papel e cópias tirados das linhas e o corte/filtro padrão.
 */
async function previousPhotos(order: PhotoOrder) {
  type Entry = { file: string | null; name: string; edits: Partial<ReopenedPhoto> };
  if (order.photos?.length) {
    return order.photos.map((photo): Entry => ({ file: originalPath(order.folder, photo.original), name: photo.name, edits: photo }));
  }
  const originals = await readdir(path.join(order.folder, "Originais")).catch(() => [] as string[]);
  const byNumber = new Map(originals.flatMap((file) => {
    const match = /^foto-(\d+) - /.exec(file);
    return match ? [[match[1], file] as const] : [];
  }));
  const found = new Map<string, Entry>();
  const add = (file: string, sizeId: string, paper: Paper, copies: number) => {
    const entry = found.get(file) ?? { file: originalPath(order.folder, `Originais/${file}`), name: file.replace(/^foto-\d+ - /, ""), edits: { sizeId, paper, copies: 0 } };
    entry.edits.copies = (entry.edits.copies ?? 0) + copies;
    found.set(file, entry);
  };
  for (const line of order.lines) {
    const paper: Paper = line.paper.toLowerCase() === "fosco" ? "fosco" : "brilho";
    for (const item of line.files) {
      const fileName = item.file.split(/[\\/]/).pop() ?? "";
      const sheet = /^folha-\d+ \(fotos? ([\d e]+)\)/.exec(fileName);
      if (sheet) {
        // Instax: a folha junta 2 cartões; cada número na folha conta como uma cópia.
        for (const number of sheet[1].split(" e ")) if (byNumber.has(number)) add(byNumber.get(number)!, line.sizeId, paper, 1);
      } else {
        add(item.original.split(/[\\/]/).pop() ?? "", line.sizeId, paper, item.copies);
      }
    }
  }
  return [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry);
}

/**
 * "Alterar fotos": recoloca as fotos do envio anterior no editor. Cada original vira um envio novo (cópia, com
 * prévia e conversão como um envio comum), então o editor e o reenvio funcionam igual a fotos recém-enviadas, e
 * a pasta anterior só é trocada quando o reenvio der certo. Quem tem o link (cliente ou equipe) pode reabrir.
 */
export async function reopenPhotoLink(database: DatabaseSync, token: string) {
  const link = findLink(database, token);
  const doc = link && loadDocument(database, link);
  if (!link || !doc) throw new PhotoOrderError("Link não encontrado. Peça um novo à loja.");
  if (!doc.editable) throw new PhotoOrderError(lockedMessage(doc));
  const previous = previousOf(database, link);
  if (!previous || previous.filesDeletedAt) throw new PhotoOrderError("Não há fotos enviadas para alterar neste link. Envie as fotos de novo.");
  const entries = await previousPhotos(previous);
  const photos: Array<ReopenedPhoto | null> = entries.map(() => null);
  await inBatches(entries, 3, async (entry, index) => {
    if (!entry.file || !existsSync(entry.file)) return;
    const upload = await saveUpload(Readable.toWeb(createReadStream(entry.file)) as unknown as ReadableStream<Uint8Array>, entry.name)
      .catch((error) => { console.error(`[fotos] não reabriu ${entry.file}:`, error instanceof Error ? error.message : error); return null; });
    if (!upload) return;
    // Mesmas regras do envio (números fora da faixa são corrigidos; tamanho que saiu do catálogo volta para 10×15).
    const raw = { landscape: upload.width > upload.height, ...entry.edits, uploadId: upload.id };
    let edits: ReturnType<typeof validatePhotos>[number];
    try {
      [edits] = validatePhotos([raw]);
    } catch {
      [edits] = validatePhotos([{ ...raw, sizeId: "10x15" }]);
    }
    photos[index] = { ...edits, name: upload.name, width: upload.width, height: upload.height, convertedFrom: upload.convertedFrom };
  });
  const reopened = photos.filter((photo): photo is ReopenedPhoto => photo !== null);
  if (!reopened.length) throw new PhotoOrderError("Não foi possível abrir as fotos enviadas. Envie as fotos de novo.");
  return { photos: reopened, missing: entries.length - reopened.length, restoredEdits: Boolean(previous.photos?.length) };
}

export async function submitPhotoLink(database: DatabaseSync, token: string, rawPhotos: unknown) {
  const link = findLink(database, token);
  const doc = link && loadDocument(database, link);
  if (!link || !doc) throw new PhotoOrderError("Link não encontrado. Peça um novo à loja.");
  if (!doc.editable) throw new PhotoOrderError(lockedMessage(doc));
  // Já enviou antes: o reenvio substitui aquele envio (mesma pasta e mesmo código).
  const previous = previousOf(database, link);
  const photos = validatePhotos(rawPhotos);
  const pro = isProfessional(database, doc.userId);
  const { uploads, summary } = await readPhotos(photos, pro);
  const special = specialPrices(doc.items, pro);
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

  let code = previous?.code ?? doc.code;
  // "envio N": só para documento antigo com mais de um link (hoje o link é um só e o reenvio substitui).
  if (!previous) for (let n = 2; codeExists(database, code); n++) code = `${doc.code} envio ${n}`;
  const submittedAt = new Date().toISOString();
  const result = await assemblePhotoFolder(database, {
    id: randomUUID(), orderId: doc.kind === "order" ? doc.id : null, code, userId: doc.userId,
    customer: { name: doc.customer.name, phone: doc.customer.phone ?? "", company: doc.customer.company ?? null },
    delivery: previous?.delivery ?? "retirada", photos, uploads, summary, unitPrice,
    // 1º envio vai para "Fotos" dentro da pasta do orçamento/pedido (erro apaga só essa subpasta); envios seguintes, pasta própria.
    folder: code === doc.code ? documentPhotosFolder(database, doc.id) : null,
    replacing: previous,
    // Na mesma transação do registro das fotos: itens do documento e o link (todos os links que apontavam para o envio anterior).
    commit: (order) => {
      saveItems(database, doc, items, total);
      database.prepare("UPDATE fare_photo_links SET submitted_at = ?, photo_order_id = ? WHERE token = ? OR photo_order_id = ?")
        .run(submittedAt, order.id, token, previous?.id ?? "");
    },
  });
  return { code: doc.code, totalCents: total, photoOrder: result.order, replaced: Boolean(previous) };
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
