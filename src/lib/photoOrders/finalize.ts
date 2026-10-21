import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  FILTERS, deadline, groupOf, minimumIssues, paperLabel, realLabel, sizeById, summarize, type Fit, type Paper, type Photo,
} from "@/components/fotos/catalog";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { orderCode } from "@/lib/orders/orderCode";
import { createOrder } from "@/lib/orders/repository";
import { renderOrderHtml } from "@/lib/proposals/html";
import type { OrderDocument } from "@/lib/proposals/orderDocument";
import { FARE_COMPANY } from "@/lib/proposals/proposal";
import { dayFolder, ORDERS_DIR } from "./config";
import { renderCard, renderPrint, renderSheet, type PhotoEdits } from "./render";
import { codeExists, customerNumberFor, insertPhotoOrder, type PhotoOrder, type PhotoOrderLine } from "./repository";
import { readUpload, removeUpload, type PhotoUpload } from "./uploads";

export type PhotoOrderInput = {
  customer: { name: string; phone: string; company?: string | null };
  delivery: "retirada" | "entrega";
  photos: Array<PhotoEdits & { uploadId: string; paper: Paper; copies: number }>;
};

export class PhotoOrderError extends Error {}

/** Nome de pasta que o Windows aceita (sem \ / : * ? " < > | e sem ponto/espaço no fim). */
export const safeFolderName = (value: string) =>
  value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 80) || "Cliente";

/** "Ana Maria da Silva" → "Ana Silva" (primeiro e último nome). */
export function firstAndLastName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] ?? "Cliente";
}

/** "10 × 15 cm" + brilho → "10x15 Brilho". */
const itemFolder = (label: string, paper: Paper) => safeFolderName(`${label.replace(" cm", "").replace(/\s*×\s*/g, "x")} ${paperLabel(paper)}`);
const copiesLabel = (copies: number) => `${copies} ${copies === 1 ? "copia" : "copias"}`;
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Confere as fotos que vieram do navegador (tamanho, papel, cópias e ajustes); preço é sempre recalculado aqui. */
export function validatePhotos(input: unknown) {
  if (!Array.isArray(input) || !input.length) throw new PhotoOrderError("O pedido não tem fotos.");
  if (input.length > 2000) throw new PhotoOrderError("Muitas fotos num pedido só.");
  return (input as PhotoOrderInput["photos"]).map((photo) => {
    if (sizeById(photo.sizeId).id !== photo.sizeId) throw new PhotoOrderError("Tamanho de foto inválido.");
    return {
      uploadId: String(photo.uploadId),
      sizeId: photo.sizeId,
      paper: (photo.paper === "fosco" ? "fosco" : "brilho") as Paper,
      copies: Math.round(clamp(photo.copies, 1, 9999, 1)),
      fit: (photo.fit === "encaixar" ? "encaixar" : "preencher") as Fit,
      landscape: Boolean(photo.landscape),
      zoom: clamp(photo.zoom, 1, 4, 1),
      x: clamp(photo.x, 0, 1, 0.5),
      y: clamp(photo.y, 0, 1, 0.5),
      border: clamp(photo.border, 0, 3, 0),
      filter: FILTERS.some((item) => item.id === photo.filter) ? photo.filter : "original",
      filterStrength: clamp(photo.filterStrength, 0, 100, 100),
      brightness: clamp(photo.brightness, -50, 50, 0),
      contrast: clamp(photo.contrast, -50, 50, 0),
      saturation: clamp(photo.saturation, -50, 50, 0),
    };
  });
}
export type ValidPhoto = ReturnType<typeof validatePhotos>[number];

/** Confere tudo o que veio do navegador; preço e prazo são sempre recalculados aqui. */
function validate(input: PhotoOrderInput) {
  const name = String(input.customer?.name ?? "").trim();
  const phone = String(input.customer?.phone ?? "").trim();
  if (name.length < 2) throw new PhotoOrderError("Informe seu nome.");
  if (phone.replace(/\D/g, "").length < 10) throw new PhotoOrderError("Informe um WhatsApp para retorno.");
  if (input.delivery !== "retirada" && input.delivery !== "entrega") throw new PhotoOrderError("Escolha retirar ou receber.");
  return { customer: { name, phone, company: input.customer.company?.trim() || null }, delivery: input.delivery, photos: validatePhotos(input.photos) };
}

/** Faz um trabalho por vez em `limit` filas (renderizar centenas de fotos sem travar o servidor). */
async function inBatches<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await work(items[index], index);
    }
  }));
}

const thumbnail = async (file: string) =>
  `data:image/jpeg;base64,${(await sharp(file).resize(360, 360, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer()).toString("base64")}`;

/**
 * Monta o pedido de fotos: pasta do cliente (criada no 1º pedido) → pasta do pedido → uma pasta por tamanho + papel
 * com os arquivos prontos para imprimir, a pasta Originais e o PED-XXXXXX.html. Grava o pedido no banco.
 */
export async function createPhotoOrder(database: DatabaseSync, user: { id: string }, input: PhotoOrderInput) {
  const data = validate(input);
  const { uploads, summary } = await readPhotos(data.photos);

  const id = randomUUID();
  const deliveryText = data.delivery === "retirada" ? "Retirar na loja." : "Receber em casa (taxa combinada no WhatsApp).";
  // Pedido do quadro (aba Pedidos, "Aguardando pagamento"): uma linha por tamanho + papel, preço da tabela.
  const boardOrder = createOrder(database, {
    userId: user.id,
    idempotencyKey: `fotos-${id}`,
    customer: { name: data.customer.name, phone: data.customer.phone, ...(data.customer.company ? { company: data.customer.company } : {}), notes: `Pedido de fotos pelo site. ${deliveryText}` },
    paymentMethod: "pix",
    items: summary.sizes.flatMap((group) => group.papers.map((line) => ({
      id: `${group.size.id}-${line.paper}`,
      productName: `${groupOf(group.size.group).item} ${group.size.label}`,
      slug: `fotos/${group.size.id}-${line.paper}`,
      quantity: line.copies,
      selections: {
        Papel: paperLabel(line.paper),
        Fotos: `${line.photos.length} ${line.photos.length === 1 ? "foto" : "fotos"}`,
      },
      artworkName: null,
      unitPrice: group.price.unit,
    }))),
  });
  const code = orderCode(boardOrder.id);
  const dropBoardOrder = () => {
    database.prepare("DELETE FROM fare_order_status_history WHERE order_id = ?").run(boardOrder.id);
    database.prepare("DELETE FROM fare_orders WHERE id = ?").run(boardOrder.id);
  };
  if (codeExists(database, code)) {
    dropBoardOrder();
    throw new PhotoOrderError("Tente de novo em instantes.");
  }
  try {
    const result = await assemblePhotoFolder(database, {
      id, orderId: boardOrder.id, code, userId: user.id, customer: data.customer, delivery: data.delivery, photos: data.photos, uploads, summary,
    });
    return { ...result, whatsappUrl: buildWhatsAppUrl(FARE_FOTO_WHATSAPP, photoOrderMessage(result.order, result.prazo)) };
  } catch (error) {
    dropBoardOrder();
    throw error;
  }
}

/** Lê os envios das fotos (falta algum = erro) e calcula o resumo com as medidas reais de cada arquivo. */
export async function readPhotos(photos: ValidPhoto[]) {
  const uploads = new Map<string, PhotoUpload>();
  for (const photo of photos) {
    const upload = uploads.get(photo.uploadId) ?? (await readUpload(photo.uploadId));
    if (!upload) throw new PhotoOrderError("Uma das fotos não chegou ao servidor. Envie de novo.");
    uploads.set(photo.uploadId, upload);
  }
  const asPhotos: Photo[] = photos.map((photo, index) => {
    const upload = uploads.get(photo.uploadId)!;
    return { ...photo, id: String(index), name: upload.name, url: "", w: upload.width, h: upload.height };
  });
  return { uploads, asPhotos, summary: summarize(asPhotos) };
}

/**
 * Pasta do cliente (criada no 1º pedido) → pasta do pedido/orçamento (`code`) → uma pasta por tamanho + papel
 * com os arquivos prontos para imprimir, a pasta Originais e o <code>.html. Grava no banco e apaga os envios.
 * `unitPrice`: preço por foto de cada tamanho (padrão: tabela do site).
 */
export async function assemblePhotoFolder(database: DatabaseSync, input: {
  id: string; orderId: string | null; code: string; userId: string;
  customer: PhotoOrder["customer"]; delivery: PhotoOrder["delivery"]; photos: ValidPhoto[];
  uploads: Map<string, PhotoUpload>; summary: ReturnType<typeof summarize>;
  unitPrice?: (sizeId: string, table: number) => number;
  /** Pasta já existente do orçamento/pedido (as fotos entram junto do arquivo do documento). */
  folder?: string | null;
}) {
  const { id, code, uploads, summary } = input;
  const data = input;
  const asPhotos: Photo[] = input.photos.map((photo, index) => {
    const upload = uploads.get(photo.uploadId)!;
    return { ...photo, id: String(index), name: upload.name, url: "", w: upload.width, h: upload.height };
  });
  const belowMinimum = minimumIssues(asPhotos);
  if (belowMinimum.length) throw new PhotoOrderError(belowMinimum.join(" "));
  const priceOf = (sizeId: string, table: number) => input.unitPrice?.(sizeId, table) ?? table;
  const customerName = safeFolderName(firstAndLastName(input.customer.name));
  const customer = customerNumberFor(database, input.userId, customerName);
  // Regra da loja: pasta do dia e, dentro dela, uma pasta por pedido com o nome do cliente.
  const orderDir = input.folder ?? path.join(ORDERS_DIR, dayFolder(), `${customerName} - ${code}`);
  await mkdir(path.join(orderDir, "Originais"), { recursive: true });

  try {
    // foto-01, foto-02… (com mais zeros quando o pedido passa de 99 fotos), na ordem em que o cliente enviou.
    const digits = Math.max(2, String(asPhotos.length).length);
    const numbered = asPhotos.map((photo, index) => ({ photo, number: String(index + 1).padStart(digits, "0") }));
    const lines: PhotoOrderLine[] = [];
    const jobs: Array<() => Promise<void>> = [];
    for (const group of summary.sizes) {
      const unit = priceOf(group.size.id, group.price.unit);
      for (const line of group.papers) {
        const folder = itemFolder(group.size.label, line.paper);
        await mkdir(path.join(orderDir, folder), { recursive: true });
        const files: PhotoOrderLine["files"] = [];
        const frame = group.size.frame;
        if (frame && frame.slots.length > 1) {
          // Instax: 2 cartões por folha. Cada cópia ocupa um cartão; as folhas juntam fotos diferentes.
          // Cartão de cada foto feito uma vez e solto da memória quando a última cópia entra na folha.
          const cards = new Map<Photo, Promise<Buffer>>();
          const remaining = new Map<Photo, number>();
          const slots = line.photos.flatMap((listed) => {
            const photo = asPhotos[Number(listed.id)];
            const { number } = numbered.find((item) => item.photo === photo)!;
            const upload = uploads.get(data.photos[Number(photo.id)].uploadId)!;
            const original = path.join("Originais", `foto-${number} - ${safeFolderName(path.parse(upload.name).name)}${path.extname(upload.original)}`);
            jobs.push(() => copyFile(upload.original, path.join(orderDir, original)));
            remaining.set(photo, photo.copies);
            const card = () => cards.get(photo) ?? cards.set(photo, renderCard(upload.source, { width: upload.width, height: upload.height }, photo).then((c) => c.buffer)).get(photo)!;
            const used = () => { const left = remaining.get(photo)! - 1; remaining.set(photo, left); if (!left) cards.delete(photo); };
            return Array.from({ length: photo.copies }, () => ({ number, original, card, used }));
          });
          const sheetDigits = Math.max(2, String(Math.ceil(slots.length / frame.slots.length)).length);
          for (let start = 0; start < slots.length; start += frame.slots.length) {
            const sheet = slots.slice(start, start + frame.slots.length);
            const numbers = [...new Set(sheet.map((slot) => slot.number))];
            const file = path.join(folder, `folha-${String(start / frame.slots.length + 1).padStart(sheetDigits, "0")} (foto${numbers.length > 1 ? "s" : ""} ${numbers.join(" e ")}).jpg`);
            files.push({ file, copies: 1, original: sheet[0].original });
            jobs.push(async () => {
              await renderSheet(frame, await Promise.all(sheet.map((slot) => slot.card())), path.join(orderDir, file));
              sheet.forEach((slot) => slot.used());
            });
          }
        }
        for (const listed of frame && frame.slots.length > 1 ? [] : line.photos) {
          const photo = asPhotos[Number(listed.id)];
          const { number } = numbered.find((item) => item.photo === photo)!;
          const upload = uploads.get(data.photos[Number(photo.id)].uploadId)!;
          const file = path.join(folder, `foto-${number} (${copiesLabel(photo.copies)}).jpg`);
          const original = path.join("Originais", `foto-${number} - ${safeFolderName(path.parse(upload.name).name)}${path.extname(upload.original)}`);
          files.push({ file, copies: photo.copies, original });
          jobs.push(async () => {
            await renderPrint(upload.source, { width: upload.width, height: upload.height }, photo, path.join(orderDir, file));
            await copyFile(upload.original, path.join(orderDir, original));
          });
        }
        lines.push({
          sizeId: group.size.id, title: `${groupOf(group.size.group).item} ${group.size.label}`, paper: paperLabel(line.paper), folder,
          realSize: realLabel(group.size), photos: line.photos.length, copies: line.copies,
          unitCents: Math.round(unit * 100), totalCents: Math.round(line.copies * unit * 100), files,
        });
      }
    }
    await inBatches(jobs, 3, (job) => job());

    const order: PhotoOrder = {
      id, orderId: input.orderId, code, userId: input.userId, customerNumber: "", customer: data.customer, delivery: data.delivery, lines,
      totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0), photoCount: asPhotos.length, copies: summary.copies, folder: orderDir,
      createdAt: new Date().toISOString(), filesDeletedAt: null,
    };
    const prazo = deadline(asPhotos);
    await writeFile(path.join(orderDir, `${code}.html`), await photoOrderHtml(order, prazo));
    insertPhotoOrder(database, { ...order, customerNumber: customer.number });
    await Promise.all([...uploads.keys()].map(removeUpload));
    return { order, customerNumber: customer.folderName.split(" - ").pop()!, prazo };
  } catch (error) {
    await rm(orderDir, { recursive: true, force: true });
    throw error;
  }
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Linhas do pedido de fotos para mensagens de WhatsApp (também vão nas observações do orçamento de brindes). */
export function photoOrderSummaryLines(order: PhotoOrder, prazo: string) {
  return [
    `Pedido de fotos ${order.code}:`,
    ...order.lines.flatMap((line) => [
      `• ${line.title} — papel ${line.paper}`,
      `  ${line.photos} ${line.photos === 1 ? "foto" : "fotos"} · ${line.copies} ${line.copies === 1 ? "cópia" : "cópias"} · ${brl(line.totalCents)} (${brl(line.unitCents)} cada)`,
    ]),
    `Total das fotos: ${brl(order.totalCents)}`,
    prazo,
    "As fotos já chegaram para a Fare Foto pelo site, na qualidade original.",
  ];
}

function photoOrderMessage(order: PhotoOrder, prazo: string) {
  return [
    `Pedido ${order.code} — Fare Foto`,
    "",
    `Cliente: ${order.customer.name}`,
    `Telefone: ${order.customer.phone}`,
    "",
    order.delivery === "retirada" ? "Entrega: vou retirar na loja." : "Entrega: quero receber em casa (taxa combinada no WhatsApp).",
    "",
    ...photoOrderSummaryLines(order, prazo),
    "",
    "Olá! Gostaria de confirmar este pedido.",
  ].join("\n");
}

/** Mesmo documento de pedido da equipe (renderOrderHtml), com uma miniatura de cada tamanho + papel. */
async function photoOrderHtml(order: PhotoOrder, prazo: string) {
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(order.createdAt));
  const items = await Promise.all(order.lines.map(async (line) => ({
    name: `${line.title} · papel ${line.paper}`,
    url: null,
    code: null,
    color: null,
    imageUrl: await thumbnail(path.join(order.folder, line.files[0].file)),
    engravings: [
      `${line.photos} ${line.photos === 1 ? "foto" : "fotos"}`,
      ...(line.realSize ? [`Tamanho real: ${line.realSize}`] : []),
      `Pasta: ${line.folder}`,
    ],
    quantity: line.copies,
    unitLabel: { one: "cópia", many: "cópias" },
    unitPrice: line.unitCents / 100,
    total: line.totalCents / 100,
  })));
  const document: OrderDocument = {
    kind: "order",
    code: order.code,
    issuedAt: date,
    seller: "Site",
    customer: { name: order.customer.name, company: order.customer.company, document: null, phone: order.customer.phone, city: null },
    items,
    subtotal: order.totalCents / 100,
    discount: null,
    total: order.totalCents / 100,
    terms: [
      { title: order.delivery === "retirada" ? "Retirada" : "Entrega", text: order.delivery === "retirada" ? "Na loja. Avisamos pelo WhatsApp quando ficar pronto." : "Em casa. Taxa combinada no WhatsApp." },
      { title: "Prazo", text: prazo },
      { title: "Pagamento", text: "Combinado no WhatsApp." },
    ],
    company: FARE_COMPANY,
    finance: null,
  };
  return renderOrderHtml(document);
}
