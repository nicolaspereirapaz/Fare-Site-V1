import { createReadStream } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { paperLabel, sizeById, type Fit, type Paper } from "@/components/fotos/catalog";
import { resolveCustomer } from "@/lib/customers/repository";
import { mediaPath } from "@/lib/atendimento/media";
import { addMessage, AtendimentoError, getConversation, listContactMedia, type StaffActor } from "@/lib/atendimento/repository";
import { createPhotoOrder, PhotoOrderError } from "@/lib/photoOrders/finalize";
import { removeUpload, saveUpload } from "@/lib/photoOrders/uploads";

export type ChatPhotoOrderInput = {
  messageIds: string[];
  sizeId: string;
  paper: Paper;
  copies: number;
  fit: Fit;
  delivery: "retirada" | "entrega";
  customerRef: string;
};

export function parseChatPhotoOrder(body: Record<string, unknown>): ChatPhotoOrderInput {
  const ids = Array.isArray(body.messageIds) ? body.messageIds.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
  const sizeId = typeof body.sizeId === "string" ? body.sizeId : "";
  if (!ids.length) throw new AtendimentoError("INVALID_REQUEST", "Escolha as fotos do pedido.");
  if (!sizeId || sizeById(sizeId).id !== sizeId) throw new AtendimentoError("INVALID_REQUEST", "Escolha o tamanho.");
  if (typeof body.customerRef !== "string" || !body.customerRef) throw new AtendimentoError("INVALID_REQUEST", "Escolha o cadastro do cliente.");
  return {
    messageIds: [...new Set(ids)],
    sizeId,
    paper: body.paper === "fosco" ? "fosco" : "brilho",
    copies: Math.min(999, Math.max(1, Math.round(Number(body.copies) || 1))),
    fit: body.fit === "encaixar" ? "encaixar" : "preencher",
    delivery: body.delivery === "entrega" ? "entrega" : "retirada",
    customerRef: body.customerRef.slice(0, 120),
  };
}

/**
 * Pedido de revelação com fotos da conversa: copia as fotos (originais) para os envios do site e cria o
 * pedido igual ao do site (quadro de Pedidos "Aguardando pagamento" + pasta do dia com arquivos prontos para imprimir).
 * Cada foto sai na orientação dela (deitada/em pé) no tamanho escolhido.
 */
export async function createChatPhotoOrder(db: DatabaseSync, conversationId: string, staff: StaffActor, input: ChatPhotoOrderInput) {
  const conversation = getConversation(db, conversationId);
  const media = listContactMedia(db, conversationId);
  const chosen = media.filter((message) => input.messageIds.includes(message.id));
  if (chosen.length !== input.messageIds.length) throw new AtendimentoError("INVALID_REQUEST", "Alguma foto escolhida não é deste contato.");
  if (chosen.some((message) => !message.media?.mime.startsWith("image/"))) throw new AtendimentoError("INVALID_REQUEST", "Só fotos entram no pedido de revelação.");
  const owner = resolveCustomer(db, input.customerRef);
  if (!owner) throw new AtendimentoError("INVALID_REQUEST", "Cadastro do cliente não encontrado.");

  const uploads: Array<{ id: string; landscape: boolean }> = [];
  try {
    for (const message of chosen) {
      const stream = Readable.toWeb(createReadStream(mediaPath(message.mediaFile))) as unknown as ReadableStream<Uint8Array>;
      const upload = await saveUpload(stream, message.media!.name || "foto.jpg");
      uploads.push({ id: upload.id, landscape: upload.width > upload.height });
    }
    const result = await createPhotoOrder(db, { id: owner.ownerId }, {
      customer: { name: owner.name || conversation.contactName || "Cliente", phone: owner.phone || conversation.phone, company: owner.company || null },
      delivery: input.delivery,
      photos: uploads.map((upload) => ({
        uploadId: upload.id,
        sizeId: input.sizeId,
        paper: input.paper,
        copies: input.copies,
        fit: input.fit,
        landscape: upload.landscape,
        zoom: 1,
        x: 0.5,
        y: 0.5,
        border: 0,
        filter: "original",
        filterStrength: 100,
        brightness: 0,
        contrast: 0,
        saturation: 0,
      })),
    });
    const size = sizeById(input.sizeId).label.replace(" cm", "");
    addMessage(db, {
      conversationId,
      author: "sistema",
      body: `${staff.name} criou o pedido ${result.order.code}: ${chosen.length} foto(s) ${size} ${paperLabel(input.paper).toLowerCase()}, ${input.copies} cópia(s) de cada.`,
    });
    return { code: result.order.code, orderId: result.order.orderId, photos: chosen.length, totalCents: result.order.totalCents, prazo: result.prazo };
  } catch (error) {
    // Pedido montado apaga os envios sozinho; aqui só sobra o que falhou no meio.
    await Promise.all(uploads.map((upload) => removeUpload(upload.id)));
    if (error instanceof PhotoOrderError) throw new AtendimentoError("INVALID_REQUEST", error.message);
    throw error;
  }
}
