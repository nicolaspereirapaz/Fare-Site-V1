import { randomUUID } from "node:crypto";
import { isProfessional } from "@/lib/professional";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  FILTERS, ZOOM, deadline, groupOf, minimumIssues, paperLabel, realLabel, sizeById, summarize, type Fit, type Paper, type Photo,
} from "@/components/fotos/catalog";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { formatDeliveryAddress, parseDeliveryAddress, type DeliveryAddress } from "@/lib/customers/address";
import { FARE_FOTO_WHATSAPP, FARE_FOTO_WHATSAPP_PRO } from "@/lib/constants";
import { orderCode } from "@/lib/orders/orderCode";
import { createOrder } from "@/lib/orders/repository";
import { renderOrderHtml } from "@/lib/proposals/html";
import type { OrderDocument } from "@/lib/proposals/orderDocument";
import { FARE_COMPANY } from "@/lib/proposals/proposal";
import { dayFolder, ORDERS_DIR } from "./config";
import { renderCard, renderPrint, renderSheet, type PhotoEdits } from "./render";
import { codeExists, customerNumberFor, insertPhotoOrder, type PhotoOrder, type PhotoOrderLine, type StoredPhoto } from "./repository";
import { readUpload, removeUpload, type PhotoUpload } from "./uploads";

export type PhotoOrderInput = {
  customer: { name: string; phone: string; company?: string | null };
  delivery: "retirada" | "entrega";
  /** Receber em casa pelo site: endereço (CEP, rua…) para a equipe calcular o frete. */
  address?: unknown;
  photos: Array<PhotoEdits & { uploadId: string; paper: Paper; copies: number }>;
};

export class PhotoOrderError extends Error {}

/**
 * Nome de pasta que o Windows aceita (sem \ / : * ? " < > | e sem ponto/espaço no fim).
 * Sem emoji nem caractere fora do BMP: o tar.exe do oraculo não grava esses nomes e a cópia para o D:\Digital trava.
 */
export const safeFolderName = (value: string) =>
  value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/[\p{Extended_Pictographic}\u{10000}-\u{10FFFF}\uFE0E\uFE0F\u200D]/gu, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 80) || "Cliente";

/** "Ana Maria da Silva" → "Ana Silva" (primeiro e último nome). */
export function firstAndLastName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] ?? "Cliente";
}

/** "10 × 15 cm" + brilho → "10x15 Brilho"; com ímã → "10x15 com ímã Brilho". */
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
      zoom: clamp(photo.zoom, ZOOM.min, ZOOM.max, 1),
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
  const address = input.delivery === "entrega" && input.address !== undefined ? deliveryAddress(input.address) : null;
  return { customer: { name, phone, company: input.customer.company?.trim() || null, ...(address ? { address } : {}) }, delivery: input.delivery, photos: validatePhotos(input.photos) };
}

/** Endereço completo de entrega, em uma linha (vai na mensagem do WhatsApp e no pedido). */
function deliveryAddress(raw: unknown) {
  let address: DeliveryAddress | null;
  try {
    address = parseDeliveryAddress(raw);
  } catch {
    throw new PhotoOrderError("CEP inválido.");
  }
  if (!address?.cep || !address.street || !address.number || !address.district || !address.city || !address.state) {
    throw new PhotoOrderError("Preencha o endereço de entrega: CEP, rua, número, bairro e cidade.");
  }
  return formatDeliveryAddress(address);
}

/** "Retirar na loja." ou "Receber em casa: <endereço>. Calcular o frete." */
export function deliveryText(order: Pick<PhotoOrder, "delivery" | "customer">) {
  if (order.delivery === "retirada") return "Retirar na loja.";
  return order.customer.address ? `Receber em casa: ${order.customer.address}. Calcular o frete.` : "Receber em casa (taxa combinada no WhatsApp).";
}

/** Faz um trabalho por vez em `limit` filas (renderizar centenas de fotos sem travar o servidor). */
export async function inBatches<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>) {
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
  // Cliente profissional (cadastro pelo convite): tabela profissional.
  const professional = isProfessional(database, user.id);
  const { uploads, summary } = await readPhotos(data.photos, professional);

  const id = randomUUID();
  // Pedido do quadro (aba Pedidos, "Aguardando pagamento"): uma linha por tamanho + papel, preço da tabela.
  const boardOrder = createOrder(database, {
    userId: user.id,
    idempotencyKey: `fotos-${id}`,
    customer: { name: data.customer.name, phone: data.customer.phone, ...(data.customer.company ? { company: data.customer.company } : {}), ...(data.customer.address ? { address: data.customer.address } : {}), notes: `Pedido de fotos pelo site. ${deliveryText(data)}` },
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
    return { ...result, whatsappUrl: buildWhatsAppUrl(professional ? FARE_FOTO_WHATSAPP_PRO : FARE_FOTO_WHATSAPP, photoOrderMessage(result.order, result.prazo)) };
  } catch (error) {
    dropBoardOrder();
    throw error;
  }
}

/** Lê os envios das fotos (falta algum = erro) e calcula o resumo com as medidas reais de cada arquivo. */
export async function readPhotos(photos: ValidPhoto[], pro = false) {
  if (!pro && photos.some((photo) => sizeById(photo.sizeId).magnet)) throw new PhotoOrderError("Foto com ímã é só para clientes profissionais.");
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
  return { uploads, asPhotos, summary: summarize(asPhotos, pro) };
}

/** Grava no banco tudo de uma vez (pedido de fotos + o que o chamador precisar): erro desfaz tudo. */
function inTransaction(database: DatabaseSync, action: () => void) {
  const nested = database.isTransaction;
  const savepoint = `fotos_${randomUUID().replaceAll("-", "")}`;
  database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
  try {
    action();
    database.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
  } catch (error) {
    database.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK");
    throw error;
  }
}

/** Nome simples de arquivo/pasta dentro da pasta do pedido (sem subpasta, sem "..", sem oculto). */
const plainName = (name: string) => Boolean(name) && !/[\\/]/.test(name) && !name.startsWith(".");

/**
 * Move as entradas `names` de `from` para `to` (rename, sem copiar). Se uma falhar, volta as que já foram e repassa o erro.
 * Devolve o "desfazer" (volta tudo para `from`).
 */
async function moveEntries(from: string, to: string, names: string[]) {
  const moved: string[] = [];
  const undo = async () => {
    for (const name of [...moved].reverse()) {
      await rename(path.join(to, name), path.join(from, name)).catch((error) => console.error(`[fotos] não voltou ${name}:`, error instanceof Error ? error.message : error));
    }
  };
  try {
    for (const name of names) {
      if (!existsSync(path.join(from, name))) continue;
      if (existsSync(path.join(to, name))) throw new PhotoOrderError(`Já existe "${name}" na pasta do pedido. Fale com a loja.`);
      await mkdir(to, { recursive: true });
      await rename(path.join(from, name), path.join(to, name));
      moved.push(name);
    }
  } catch (error) {
    await undo();
    throw error;
  }
  return undo;
}

/**
 * Pasta do cliente (criada no 1º pedido) → pasta do pedido/orçamento (`code`) → uma pasta por tamanho + papel
 * com os arquivos prontos para imprimir, a pasta Originais e o <code>.html. Grava no banco e apaga os envios.
 * `unitPrice`: preço por foto de cada tamanho (padrão: tabela do site).
 * `replacing`: reenvio pelo link. A pasta nova é montada à parte (".reenvio-…" dentro da pasta anterior) e só no fim
 * troca de lugar com as fotos anteriores; o registro anterior sai do banco na mesma transação. Qualquer erro deixa
 * a pasta e o registro anteriores como estavam. Outros arquivos da pasta (documento do pedido) não são tocados.
 * `commit`: gravações do chamador (itens do documento, link) na mesma transação do pedido de fotos.
 */
export async function assemblePhotoFolder(database: DatabaseSync, input: {
  id: string; orderId: string | null; code: string; userId: string;
  customer: PhotoOrder["customer"]; delivery: PhotoOrder["delivery"]; photos: ValidPhoto[];
  uploads: Map<string, PhotoUpload>; summary: ReturnType<typeof summarize>;
  unitPrice?: (sizeId: string, table: number) => number;
  /** Pasta já existente do orçamento/pedido (as fotos entram junto do arquivo do documento). */
  folder?: string | null;
  replacing?: PhotoOrder | null;
  commit?: (order: PhotoOrder) => void;
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
  const previous = input.replacing ?? null;
  // Reenvio com a pasta anterior ainda no disco: monta ao lado e troca no fim.
  const staged = Boolean(previous && existsSync(previous.folder));
  // Regra da loja: pasta do dia e, dentro dela, uma pasta por pedido com o nome do cliente.
  const finalDir = staged ? previous!.folder : input.folder ?? path.join(ORDERS_DIR, dayFolder(), `${customerName} - ${code}`);
  const orderDir = staged ? path.join(finalDir, `.reenvio-${id}`) : finalDir;
  await mkdir(path.join(orderDir, "Originais"), { recursive: true });

  try {
    // foto-01, foto-02… (com mais zeros quando o pedido passa de 99 fotos), na ordem em que o cliente enviou.
    const digits = Math.max(2, String(asPhotos.length).length);
    const numbered = asPhotos.map((photo, index) => ({ photo, number: String(index + 1).padStart(digits, "0") }));
    const originalName = (index: number) => {
      const upload = uploads.get(data.photos[index].uploadId)!;
      return `foto-${numbered[index].number} - ${safeFolderName(path.parse(upload.name).name)}${path.extname(upload.original)}`;
    };
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
            const original = path.join("Originais", originalName(Number(photo.id)));
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
          const original = path.join("Originais", originalName(Number(photo.id)));
          files.push({ file, copies: photo.copies, original });
          jobs.push(async () => {
            await renderPrint(upload.source, { width: upload.width, height: upload.height }, photo, path.join(orderDir, file));
            await copyFile(upload.original, path.join(orderDir, original));
          });
        }
        lines.push({
          sizeId: group.size.id, title: `${groupOf(group.size.group).item} ${group.size.label}`, paper: paperLabel(line.paper), folder,
          // Tamanho digitado: sai na folha cinza do tamanho da tabela; a equipe recorta no tamanho pedido.
          realSize: group.size.base ? `papel ${group.size.base.label}, recortar em ${group.size.label}` : realLabel(group.size), photos: line.photos.length, copies: line.copies,
          unitCents: Math.round(unit * 100), totalCents: Math.round(line.copies * unit * 100), files,
        });
      }
    }
    await inBatches(jobs, 3, (job) => job());

    // Ajustes de cada foto: o link reabre com o mesmo corte, filtro, tamanho, papel e cópias.
    const photos: StoredPhoto[] = data.photos.map(({ uploadId, ...edits }, index) => {
      const upload = uploads.get(uploadId)!;
      return { ...edits, original: `Originais/${originalName(index)}`, name: upload.name, width: upload.width, height: upload.height };
    });
    const order: PhotoOrder = {
      id, orderId: input.orderId, code, userId: input.userId, customerNumber: "", customer: data.customer, delivery: data.delivery, lines,
      totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0), photoCount: asPhotos.length, copies: summary.copies, folder: finalDir,
      createdAt: new Date().toISOString(), filesDeletedAt: null, photos,
    };
    const prazo = deadline(asPhotos);
    await writeFile(path.join(orderDir, `${code}.html`), await photoOrderHtml({ ...order, folder: orderDir }, prazo));

    // Reenvio: as fotos anteriores (pastas de tamanho, Originais e o .html) vão para ".anterior-…", as novas entram no lugar.
    const backupDir = path.join(finalDir, `.anterior-${id}`);
    let undoOld: (() => Promise<void>) | null = null;
    let undoNew: (() => Promise<void>) | null = null;
    if (staged) {
      const oldEntries = [...new Set([...previous!.lines.map((line) => line.folder), "Originais", `${previous!.code}.html`])].filter(plainName);
      undoOld = await moveEntries(finalDir, backupDir, oldEntries);
      try {
        undoNew = await moveEntries(orderDir, finalDir, (await readdir(orderDir)).filter(plainName));
      } catch (error) {
        await undoOld();
        await rmdir(backupDir).catch(() => undefined); // só se ficou vazia (tudo voltou)
        throw error;
      }
    }
    try {
      inTransaction(database, () => {
        if (previous) database.prepare("DELETE FROM fare_photo_orders WHERE id = ?").run(previous.id);
        insertPhotoOrder(database, { ...order, customerNumber: customer.number });
        input.commit?.(order);
      });
    } catch (error) {
      await undoNew?.();
      await undoOld?.();
      if (staged) await rmdir(backupDir).catch(() => undefined); // só se ficou vazia (tudo voltou)
      throw error;
    }
    if (staged) {
      for (const dir of [backupDir, orderDir]) {
        await rm(dir, { recursive: true, force: true }).catch((error) => console.error(`[fotos] não apagou ${dir}:`, error instanceof Error ? error.message : error));
      }
    }
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
    order.delivery === "retirada" ? "Entrega: vou retirar na loja." : order.customer.address
      ? `Entrega: quero receber em casa.\nEndereço: ${order.customer.address}\nPor favor, calcule o frete.`
      : "Entrega: quero receber em casa (taxa combinada no WhatsApp).",
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
      { title: order.delivery === "retirada" ? "Retirada" : "Entrega", text: order.delivery === "retirada" ? "Na loja. Avisamos pelo WhatsApp quando ficar pronto." : order.customer.address ? `Em casa: ${order.customer.address}. Frete calculado pela equipe no WhatsApp.` : "Em casa. Taxa combinada no WhatsApp." },
      { title: "Prazo", text: prazo },
      { title: "Pagamento", text: "Combinado no WhatsApp." },
    ],
    company: FARE_COMPANY,
    finance: null,
  };
  return renderOrderHtml(document);
}
